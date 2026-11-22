import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import berthUrl from "./textures/berth.jpg";
import counterUrl from "./textures/counter.jpg";
import fabricUrl from "./textures/fabric.jpg";
import knitUrl from "./textures/knit.jpg";
import plaidUrl from "./textures/plaid.jpg";
import rugUrl from "./textures/rug.jpg";
import soleUrl from "./textures/sole.jpg";
import teakUrl from "./textures/teak.jpg";

/**
 * A 3D model of MoonlightLady's main deck (saloon, galley, head, forward and aft cabins),
 * built from the owner's photos. Everything is placed in the deck layout's 0–1 picture
 * coordinates — u: stern (0) → bow (1), v: port (0) → starboard (1) — so storage pins sit
 * where they do on the 2D plan.
 */

export interface ScenePin {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  itemCount: number;
}

export type ViewName = "forward" | "aft" | "overhead";

// Size of the layout picture's area in metres, and the cabin heights.
const L = 14;
const W = 4.9;
const CEILING = 1.95;
const X = (u: number) => (u - 0.5) * L;
const Z = (v: number) => (v - 0.5) * W;

/** Half the hull's width (in v units) at u, at its widest height. Zero beyond the transom and bow. */
function halfBeam(u: number) {
  if (u < 0.09 || u > 0.93) return 0;
  if (u < 0.45) return 0.33 + 0.07 * Math.sin(((u - 0.09) / 0.36) * (Math.PI / 2));
  const t = (u - 0.45) / 0.48;
  return 0.4 * Math.pow(Math.max(0, 1 - t * t), 0.75);
}

/** Cross-section of the inside of the hull: height → fraction of halfBeam. Hull flares out, coachroof leans in. */
const PROFILE: [number, number][] = [
  [0, 0.8], [0.5, 0.9], [1.0, 1.0], [1.15, 0.92], [CEILING, 0.7],
];
function wallFactor(h: number) {
  for (let i = 1; i < PROFILE.length; i++) {
    const [h0, f0] = PROFILE[i - 1];
    const [h1, f1] = PROFILE[i];
    if (h <= h1) return f0 + ((f1 - f0) * (h - h0)) / (h1 - h0);
  }
  return PROFILE[PROFILE.length - 1][1];
}

/** How high a pin floats, guessed from its name (the 2D plan only knows where, not how high). */
export function pinHeight(name: string) {
  const n = name.toLowerCase();
  if (/\btop\b|overhead|ceiling/.test(n)) return 1.7;
  if (/pullman|medicine|tool/.test(n)) return 1.4;
  if (/tray|shelf/.test(n)) return 1.25;
  if (/closet|locker|cabinet/.test(n)) return 1.1;
  if (/nook|chart/.test(n)) return 0.9;
  if (/bedside|berth|bed\b|v-berth/.test(n)) return 0.75;
  if (/couch|settee|bench|seat|sofa/.test(n)) return 0.3;
  if (/galley|under|bilge|floor/.test(n)) return 0.45;
  return 0.9;
}

// ── Textures (drawn on canvases so nothing has to be downloaded) ─────────────────────────────

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...repeat);
  }
  return tex;
}

/**
 * Swatches cut from the owner's photos of the boat (teak, settee fabric, rug, sole, cushions…).
 * Geometry UVs are in metres, so `tile` is how many metres one copy of the swatch covers.
 * Mirrored repeats hide the seams between copies.
 */
function photoTexture(url: string, tile: number) {
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  tex.repeat.set(1 / tile, 1 / tile);
  return tex;
}

/** Give a box UVs in metres on every face, so textures keep their real size instead of stretching. */
function metreUVs(geo: THREE.BoxGeometry, w: number, h: number, d: number) {
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  // Faces in order: +x, -x, +y, -y, +z, -z (4 corners each).
  const sizes: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let i = 0; i < uv.count; i++) {
    const [su, sv] = sizes[Math.floor(i / 4)];
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  uv.needsUpdate = true;
  return geo;
}

/** Breaker panel: dark board with rows of switches. */
function panelTexture() {
  return canvasTexture(128, 160, c => {
    c.fillStyle = "#23262c";
    c.fillRect(0, 0, 128, 160);
    for (let r = 0; r < 8; r++) for (let k = 0; k < 2; k++) {
      c.fillStyle = "#c9ccd2";
      c.fillRect(14 + k * 58, 12 + r * 18, 34, 8);
      c.fillStyle = r % 3 ? "#d23b2f" : "#3fbf5f";
      c.fillRect(54 + k * 58, 13 + r * 18, 6, 6);
    }
  });
}

// ── The scene ──────────────────────────────────────────────────────────────────────────────

export class SaloonScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private overhead = new THREE.Group(); // ceiling and what hangs from it; hidden when looking from above
  private pinGroup = new THREE.Group();
  private pinHits: THREE.Mesh[] = [];
  private pinParts = new Map<string, { ball: THREE.Mesh; ghost: THREE.Mesh; label: THREE.Sprite; pos: THREE.Vector3 }>();
  private planOverlay: THREE.Mesh | null = null;
  private raf = 0;
  private flight: { fromPos: THREE.Vector3; toPos: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; t: number } | null = null;
  private selectedId: string | null = null;
  private showNames = false;
  private clock = new THREE.Clock();
  private disposables: { dispose(): void }[] = [];
  private resizeObserver: ResizeObserver;
  private down: { x: number; y: number } | null = null;
  onSelect: (id: string | null) => void = () => {};
  /** The boat reached the end of a roll (strength 0–1): a good moment for a creak. */
  onRollPeak: (strength: number) => void = () => {};
  private lastRoll = 0;
  private rollingUp = true;
  /** Gentle rolling at the dock; off for people who've asked their device for less motion. */
  private rocking = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color("#1a2433");
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 100);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 16;
    this.controls.rotateSpeed = -0.45; // inside a room it feels natural to drag the view, not the boat
    this.controls.addEventListener("start", () => (this.flight = null));

    this.buildLights();
    this.buildCabin();
    this.scene.add(this.overhead, this.pinGroup);

    const el = this.renderer.domElement;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointerup", this.onPointerUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.setView("forward", true);
    this.loop();
  }

  // ── Materials and helpers ────────────────────────────────────────────────────────────────

  private teakTex = this.keep(photoTexture(teakUrl, 0.35));
  private mat = {
    teak: this.keep(new THREE.MeshStandardMaterial({ map: this.teakTex, roughness: 0.38, metalness: 0.05 })),
    teakDark: this.keep(new THREE.MeshStandardMaterial({ color: "#7a3e1c", roughness: 0.45 })),
    liner: this.keep(new THREE.MeshStandardMaterial({ color: "#f2efe8", roughness: 0.55 })),
    ceiling: this.keep(new THREE.MeshStandardMaterial({ color: "#f4f2ec", roughness: 0.7 })),
    sole: this.keep(new THREE.MeshStandardMaterial({ map: this.keep(photoTexture(soleUrl, 0.6)), roughness: 0.35 })),
    blue: this.keep(new THREE.MeshStandardMaterial({ map: this.keep(photoTexture(fabricUrl, 0.5)), roughness: 0.95 })),
    pillowWhite: this.keep(new THREE.MeshStandardMaterial({ map: this.keep(photoTexture(knitUrl, 0.2)), roughness: 1 })),
    pillowBlue: this.keep(new THREE.MeshStandardMaterial({ map: this.keep(photoTexture(plaidUrl, 0.18)), roughness: 1 })),
    pillowGrey: this.keep(new THREE.MeshStandardMaterial({ color: "#5d6577", roughness: 1 })),
    counter: this.keep(new THREE.MeshStandardMaterial({ map: this.keep(photoTexture(counterUrl, 0.4)), roughness: 0.5 })),
    steel: this.keep(new THREE.MeshStandardMaterial({ color: "#b9bec6", roughness: 0.3, metalness: 0.85 })),
    darkSteel: this.keep(new THREE.MeshStandardMaterial({ color: "#3a3f47", roughness: 0.5, metalness: 0.6 })),
    kettle: this.keep(new THREE.MeshStandardMaterial({ color: "#1fa5a8", roughness: 0.3, metalness: 0.2 })),
    rug: this.keep(new THREE.MeshStandardMaterial({ map: this.keep(photoTexture(rugUrl, 0.4)), roughness: 1 })),
    berth: this.keep(new THREE.MeshStandardMaterial({ map: this.keep(photoTexture(berthUrl, 0.3)), roughness: 1 })),
    glassLight: this.keep(new THREE.MeshStandardMaterial({ color: "#dfeefa", emissive: "#bcd9f2", emissiveIntensity: 0.75 })),
    curtain: this.keep(new THREE.MeshStandardMaterial({ color: "#1d4fb8", roughness: 0.9 })),
    domeLight: this.keep(new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#fff4dc", emissiveIntensity: 0.8 })),
    white: this.keep(new THREE.MeshStandardMaterial({ color: "#f7f7f5", roughness: 0.3 })),
    panel: this.keep(new THREE.MeshStandardMaterial({ map: this.keep(panelTexture()), roughness: 0.6 })),
    carpet: this.keep(new THREE.MeshStandardMaterial({ color: "#4a4d55", roughness: 1 })),
    matBlue: this.keep(new THREE.MeshStandardMaterial({ color: "#2346b0", roughness: 1 })),
    glass: this.keep(new THREE.MeshStandardMaterial({ color: "#4a3c33", roughness: 0.12, metalness: 0.35 })),
  };

  private keep<T extends { dispose(): void }>(thing: T): T {
    this.disposables.push(thing);
    return thing;
  }

  /** A box between two u's, two v's and two heights. */
  private box(u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, mat: THREE.Material, parent: THREE.Object3D = this.scene) {
    const w = Math.abs(X(u1) - X(u0)), d = Math.abs(Z(v1) - Z(v0));
    const geo = this.keep(metreUVs(new THREE.BoxGeometry(w, y1 - y0, d), w, y1 - y0, d));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((X(u0) + X(u1)) / 2, (y0 + y1) / 2, (Z(v0) + Z(v1)) / 2);
    parent.add(mesh);
    return mesh;
  }

  /** v of the inside of the hull at u and height h, on port (-1) or starboard (+1). */
  private wallV(u: number, h: number, side: -1 | 1, inset = 0) {
    return 0.5 + side * (wallFactor(h) * halfBeam(u) - inset);
  }

  // ── Building ─────────────────────────────────────────────────────────────────────────────

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight("#fff6ea", "#6b4428", 1.0));
    this.scene.add(new THREE.AmbientLight("#ffe9d0", 0.35));
    const sun = new THREE.DirectionalLight("#ffffff", 1.2);
    sun.position.set(2, 10, 3);
    this.scene.add(sun);
    for (const [u, v] of [[0.47, 0.5], [0.56, 0.6], [0.38, 0.5], [0.72, 0.5]] as const) {
      const p = new THREE.PointLight("#ffe2b8", 2.4, 7, 1.4);
      p.position.set(X(u), CEILING - 0.15, Z(v));
      this.scene.add(p);
    }
  }

  private buildCabin() {
    const N = 64;
    const u0 = 0.09, u1 = 0.93;
    const us = Array.from({ length: N + 1 }, (_, i) => u0 + ((u1 - u0) * i) / N);

    // Hull sides, one strip per band of the cross-section so each band gets its own finish.
    const bands: [number, number, THREE.Material][] = [
      [0, 2, this.mat.teak],     // lower hull, behind the furniture
      [2, 3, this.mat.teakDark], // the shelf / rail along the hull
      [3, 4, this.mat.liner],    // white coachroof sides
    ];
    for (const side of [-1, 1] as const) {
      for (const [a, b, mat] of bands) {
        const pos: number[] = [];
        const uv: number[] = [];
        const idx: number[] = [];
        const rows = PROFILE.slice(a, b + 1);
        us.forEach((u, i) => rows.forEach(([h, f], j) => {
          pos.push(X(u), h, Z(0.5 + side * f * halfBeam(u)));
          uv.push(X(u), h);
          if (i < N && j < rows.length - 1) {
            const c = i * rows.length + j, n = c + rows.length;
            // Faces point inwards, so the walls vanish when you look in from outside.
            if (side < 0) idx.push(c, n, c + 1, n, n + 1, c + 1);
            else idx.push(c, c + 1, n, n, c + 1, n + 1);
          }
        }));
        this.scene.add(new THREE.Mesh(this.geometry(pos, uv, idx), mat));
      }
    }

    // Cabin sole (floor) and ceiling.
    this.scene.add(new THREE.Mesh(this.strip(us, 0, PROFILE[0][1], true), this.mat.sole));
    const ceiling = new THREE.Mesh(this.strip(us, CEILING, PROFILE[PROFILE.length - 1][1], false), this.mat.ceiling);
    this.overhead.add(ceiling);

    // Transom wall at the back of the aft cabin.
    const transom = this.bulkheadShape(0.09, [], 0.02);
    transom.position.x += 0.01;
    this.scene.add(transom);

    this.buildBulkheads();
    this.buildSaloon();
    this.buildGalley();
    this.buildAft();
    this.buildForward();
    this.buildOverhead();
  }

  private geometry(pos: number[], uv: number[], idx: number[]) {
    const g = this.keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /** Floor (facing up) or ceiling (facing down) across the hull at a height. */
  private strip(us: number[], h: number, factor: number, up: boolean) {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    us.forEach((u, i) => {
      const hb = factor * halfBeam(u);
      pos.push(X(u), h, Z(0.5 - hb), X(u), h, Z(0.5 + hb));
      uv.push(X(u), Z(0.5 - hb), X(u), Z(0.5 + hb));
      if (i < us.length - 1) {
        const p = i * 2, s = p + 1, np = p + 2, ns = p + 3;
        if (up) idx.push(p, s, np, s, ns, np);
        else idx.push(p, np, s, s, np, ns);
      }
    });
    return this.geometry(pos, uv, idx);
  }

  /**
   * A teak bulkhead filling the hull's cross-section at u, with door openings.
   * Each opening is [v0, v1, top]; openings start at the floor (a low sill keeps the shape closed).
   */
  private bulkheadShape(u: number, doors: [number, number, number][], thick = 0.04, mat: THREE.Material = this.mat.teak, vRange?: [number, number]) {
    const hb = halfBeam(u);
    const shape = new THREE.Shape();
    const left = PROFILE.map(([h, f]) => [Z(Math.max(0.5 - f * hb, vRange?.[0] ?? 0)), h] as const);
    const right = [...PROFILE].reverse().map(([h, f]) => [Z(Math.min(0.5 + f * hb, vRange?.[1] ?? 1)), h] as const);
    shape.moveTo(left[0][0], left[0][1]);
    for (const [z, h] of [...left.slice(1), ...right]) shape.lineTo(z, h);
    shape.closePath();
    for (const [v0, v1, top] of doors) {
      const hole = new THREE.Path();
      const z0 = Z(v0), z1 = Z(v1), r = Math.min((z1 - z0) / 2, 0.18);
      hole.moveTo(z0, 0.04);
      hole.lineTo(z1, 0.04);
      hole.lineTo(z1, top - r);
      hole.quadraticCurveTo(z1, top, z1 - r, top);
      hole.lineTo(z0 + r, top);
      hole.quadraticCurveTo(z0, top, z0, top - r);
      hole.closePath();
      shape.holes.push(hole);
    }
    const geo = this.keep(new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 6 }));
    // Shape is drawn in (z, y); turn it to face along the boat.
    geo.rotateY(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.x = X(u) - thick / 2;
    // rotateY maps shape-x → -world-z; mirror back so port stays port.
    mesh.scale.z = -1;
    (mat as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    return mesh;
  }

  private buildBulkheads() {
    // Forward bulkhead between the saloon and the forward cabin, with its arched door.
    this.scene.add(this.bulkheadShape(0.605, [[0.445, 0.555, 1.82]]));
    // The open door, swung back against the bulkhead to port.
    const door = this.box(0.585, 0.6, 0.335, 0.44, 0.06, 1.8, this.mat.teak);
    door.rotation.y = 0.12;

    // Aft bulkhead: aft-cabin door (port), companionway (middle), head door (starboard).
    this.scene.add(this.bulkheadShape(0.345, [[0.3, 0.385, 1.85]], 0.04, this.mat.teak, [0, 0.43]));
    this.scene.add(this.bulkheadShape(0.345, [[0.6, 0.7, 1.85]], 0.04, this.mat.teak, [0.57, 1]));
  }

  private buildSaloon() {
    const m = this.mat;
    const portWall = (u: number, h: number, inset = 0) => this.wallV(u, h, -1, inset);

    // U-shaped settee to port: long leg along the hull, short leg along the forward bulkhead.
    this.box(0.42, 0.585, portWall(0.5, 0, -0.02), 0.27, 0, 0.4, m.teak);
    this.box(0.42, 0.585, portWall(0.5, 0.4, -0.02), 0.27, 0.4, 0.52, m.blue);
    this.box(0.42, 0.585, portWall(0.5, 0.6), portWall(0.5, 0.6) + 0.055, 0.52, 0.98, m.blue); // backrest
    this.box(0.535, 0.585, 0.27, 0.43, 0, 0.4, m.teak);
    this.box(0.535, 0.585, 0.27, 0.43, 0.4, 0.52, m.blue);
    this.box(0.585, 0.6, 0.2, 0.43, 0.52, 0.95, m.blue); // backrest against the bulkhead
    // Teak trim round the front of the seats.
    this.box(0.42, 0.535, 0.268, 0.274, 0, 0.42, m.teakDark);
    this.box(0.532, 0.538, 0.27, 0.43, 0, 0.42, m.teakDark);

    // Saloon table on a steel pedestal.
    this.box(0.462, 0.548, 0.27, 0.405, 0.71, 0.76, m.teak);
    const leg = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.05, 0.05, 0.71, 16)), m.steel);
    leg.position.set(X(0.505), 0.355, Z(0.34));
    this.scene.add(leg);

    // Free-standing bench in the middle, facing the table, with a curved teak back and arms.
    this.box(0.462, 0.55, 0.44, 0.515, 0, 0.4, m.teak);
    this.box(0.462, 0.55, 0.44, 0.515, 0.4, 0.52, m.blue);
    this.box(0.462, 0.55, 0.505, 0.525, 0.4, 0.9, m.teak);
    this.box(0.462, 0.55, 0.495, 0.507, 0.52, 0.85, m.blue);
    this.box(0.458, 0.466, 0.44, 0.525, 0.4, 0.72, m.teak);
    this.box(0.546, 0.554, 0.44, 0.525, 0.4, 0.72, m.teak);

    // Throw pillows.
    const pillowGeo = this.keep(metreUVs(new THREE.BoxGeometry(0.4, 0.38, 0.12), 0.4, 0.38, 0.12));
    const pillow = (u: number, v: number, h: number, mat: THREE.Material, rot = 0) => {
      const p = new THREE.Mesh(pillowGeo, mat);
      p.position.set(X(u), h + 0.17, Z(v));
      p.rotation.set(-0.25, rot, 0, "YXZ");
      this.scene.add(p);
    };
    // rot: 0 faces starboard (sitting against the port hull), π/2 faces aft, π faces port.
    pillow(0.45, 0.2, 0.52, m.pillowWhite, 0.15);
    pillow(0.43, 0.195, 0.52, m.pillowGrey, -0.1);
    pillow(0.57, 0.31, 0.52, m.pillowWhite, -Math.PI / 2 + 0.2);
    pillow(0.57, 0.38, 0.52, m.pillowGrey, -Math.PI / 2);
    pillow(0.53, 0.49, 0.52, m.pillowBlue, Math.PI);
    pillow(0.48, 0.49, 0.52, m.pillowBlue, Math.PI + 0.1);

    // Lockers and bookshelf above the settee, along the port hull.
    const lv0 = portWall(0.5, 1.15, 0.005), lv1 = lv0 + 0.075;
    this.box(0.42, 0.5, lv0, lv1, 1.0, 1.42, m.teak);
    this.box(0.5, 0.585, lv0, lv1 - 0.03, 1.0, 1.15, m.teakDark); // open bookshelf
    for (let i = 0; i < 9; i++) {
      const u = 0.505 + i * 0.008;
      this.box(u, u + 0.006, lv0 + 0.004, lv0 + 0.035, 1.15, 1.15 + 0.14 + (i % 3) * 0.02,
        [m.pillowWhite, m.curtain, m.kettle, m.pillowGrey][i % 4]);
    }

    // Chart table and electrical panel, port side at the aft end of the saloon.
    this.box(0.36, 0.42, portWall(0.39, 0.8, -0.02), 0.27, 0, 0.74, m.teak);
    this.box(0.355, 0.42, portWall(0.39, 0.8, -0.02), 0.275, 0.74, 0.8, m.teakDark);
    this.box(0.36, 0.415, portWall(0.39, 1.2, 0.005), portWall(0.39, 1.2, 0.005) + 0.012, 0.95, 1.4, m.panel);
    // Small instrument screen on the bulkhead above.
    this.box(0.345, 0.35, 0.2, 0.26, 1.2, 1.4, m.glass);

    // Rug in the aisle.
    this.box(0.4, 0.46, 0.3, 0.45, 0.002, 0.01, m.rug);
  }

  private buildGalley() {
    const m = this.mat;
    const sw = (u: number, h: number, inset = 0) => this.wallV(u, h, 1, inset);
    const inner = 0.7;
    // Base cabinets and countertop along the starboard side.
    this.box(0.375, 0.585, inner, sw(0.48, 0, -0.03), 0, 0.88, m.teak);
    this.box(0.372, 0.588, inner - 0.006, sw(0.48, 0.9, 0.005), 0.88, 0.92, m.counter);
    this.box(0.372, 0.588, inner - 0.008, inner - 0.002, 0.86, 0.94, m.teakDark); // fiddle rail
    // Cabinet doors.
    for (const u of [0.39, 0.44, 0.5, 0.55]) this.box(u, u + 0.035, inner - 0.004, inner, 0.12, 0.78, m.teakDark);
    // Double sink at the forward end.
    this.box(0.535, 0.58, 0.73, 0.82, 0.8, 0.925, m.steel);
    const tap = new THREE.Mesh(this.keep(new THREE.TorusGeometry(0.08, 0.012, 8, 16, Math.PI)), m.steel);
    tap.position.set(X(0.56), 0.93, Z(0.84));
    tap.rotation.y = Math.PI / 2;
    this.scene.add(tap);
    // Gimballed stove with the teal kettle on it.
    this.box(0.49, 0.528, 0.715, 0.8, 0.55, 0.93, m.darkSteel);
    this.box(0.489, 0.529, 0.712, 0.716, 0.58, 0.88, m.steel);
    const kettle = new THREE.Mesh(this.keep(new THREE.SphereGeometry(0.09, 20, 14)), m.kettle);
    kettle.scale.y = 0.85;
    kettle.position.set(X(0.509), 1.0, Z(0.755));
    this.scene.add(kettle);
    // Icebox lids on the counter aft of the stove.
    this.box(0.4, 0.46, 0.73, 0.83, 0.92, 0.925, m.white);

    // Lockers outboard and above the counter, with smoked glass fronts.
    const lv1 = sw(0.48, 1.15, 0.005), lv0 = lv1 - 0.08;
    this.box(0.375, 0.585, lv0, lv1, 1.12, 1.48, m.teak);
    for (const u of [0.39, 0.445, 0.5, 0.545]) this.box(u, u + 0.035, lv0 - 0.004, lv0, 1.18, 1.42, m.glass);

    // Main hanging locker between the galley and the head.
    this.scene.add(this.bulkheadShape(0.36, [], 0.42, m.teak, [0.68, 1]));
    this.box(0.35, 0.37, 0.676, 0.68, 0.1, 1.85, m.teakDark);
  }

  private buildAft() {
    const m = this.mat;
    // Companionway: engine box with a carpet top, then steps up to the hatch.
    this.box(0.305, 0.345, 0.43, 0.57, 0, 0.55, m.teak);
    this.box(0.305, 0.345, 0.43, 0.57, 0.55, 0.57, m.carpet);
    for (let i = 0; i < 3; i++) {
      const u = 0.3 - i * 0.012;
      this.box(u - 0.014, u, 0.45, 0.55, 0.85 + i * 0.35, 0.88 + i * 0.35, m.teak);
    }
    this.box(0.255, 0.3, 0.43, 0.57, 0, 0.85, m.teak); // under the steps
    // Cockpit above everything aft of the companionway: the aft cabin's low ceiling (hidden from above).
    for (let u = 0.09; u < 0.345; u += 0.0255) {
      const u1 = Math.min(0.345, u + 0.0255);
      this.box(u, u1, this.wallV(u, 1.3, -1), 0.43, 1.3, 1.36, m.liner, this.overhead);
      if (u1 <= 0.245) this.box(u, u1, 0.57, this.wallV(u, 1.3, 1), 1.3, 1.36, m.liner, this.overhead);
    }
    this.box(0.09, 0.255, 0.43, 0.57, 0.85, CEILING, m.teak, this.overhead); // cockpit footwell
    this.box(0.09, 0.255, 0.43, 0.57, 0, 0.85, m.teak);
    this.box(0.09, 0.24, 0.57, this.wallV(0.09, 0, 1), 0, 1.3, m.liner); // lazarette behind the head

    // Aft cabin (port): double berth and its inner wall.
    this.box(0.105, 0.3, 0.12, 0.42, 0, 0.5, m.teak);
    this.box(0.105, 0.3, 0.13, 0.42, 0.5, 0.62, m.berth);
    this.box(0.09, 0.345, 0.42, 0.43, 0, 1.3, m.teak);
    this.box(0.25, 0.34, 0.13, 0.2, 0.62, 1.3, m.teak); // aft cabin closet

    // Head (starboard): white moulded room, toilet, medicine cabinets.
    this.box(0.24, 0.345, 0.57, 0.58, 0, CEILING, m.white);
    this.scene.add(this.bulkheadShape(0.245, [], 0.02, m.white, [0.57, 1]));
    const bowl = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.17, 0.13, 0.4, 20)), m.white);
    bowl.position.set(X(0.29), 0.2, Z(0.66));
    this.scene.add(bowl);
    const seat = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 20)), m.white);
    seat.position.set(X(0.29), 0.42, Z(0.66));
    this.scene.add(seat);
    this.box(0.25, 0.32, this.wallV(0.29, 1.3, 1, 0.07), this.wallV(0.29, 1.3, 1, 0.005), 1.15, 1.55, m.teak);
    this.box(0.25, 0.32, this.wallV(0.29, 0, 1, -0.03), this.wallV(0.29, 0.8, 1, 0.08), 0, 0.8, m.white); // vanity
    this.box(0.3, 0.33, 0.78, 0.82, 0.25, 0.8, this.mat.matBlue);
    this.box(0.36, 0.42, 0.56, 0.66, 0.002, 0.012, m.matBlue); // bath mat outside the door
  }

  private buildForward() {
    const m = this.mat;
    // V-berth: a platform following the hull's shape.
    const shape = new THREE.Shape();
    const us = Array.from({ length: 24 }, (_, i) => 0.635 + (0.915 - 0.635) * (i / 23));
    const f = PROFILE[0][1];
    us.forEach((u, i) => (i ? shape.lineTo : shape.moveTo).call(shape, X(u), -Z(0.5 - f * halfBeam(u))));
    [...us].reverse().forEach(u => shape.lineTo(X(u), -Z(0.5 + f * halfBeam(u))));
    shape.closePath();
    const base = this.keep(new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false }));
    base.rotateX(-Math.PI / 2);
    this.scene.add(new THREE.Mesh(base, m.teak));
    const cushion = this.keep(new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }));
    cushion.rotateX(-Math.PI / 2);
    const c = new THREE.Mesh(cushion, m.berth);
    c.position.y = 0.6;
    c.scale.set(0.995, 1, 0.97);
    this.scene.add(c);
    // Pillows and a folded blanket at the head of the berth.
    this.box(0.655, 0.675, 0.38, 0.47, 0.72, 0.84, m.pillowWhite);
    this.box(0.655, 0.675, 0.53, 0.62, 0.72, 0.84, m.pillowWhite);
    this.box(0.8, 0.84, 0.42, 0.58, 0.72, 0.78, m.pillowBlue);

    // Hanging lockers forward of the bulkhead on both sides.
    this.scene.add(this.bulkheadShape(0.6375, [], 0.75, m.teak, [0.66, 1]));
    this.box(0.665, 0.667, 0.67, 0.75, 0.1, 1.5, m.teakDark);
    this.scene.add(this.bulkheadShape(0.635, [], 0.7, m.teak, [0, 0.35]));
    // Shelf trays along the hull, above the berth.
    for (const side of [-1, 1] as const) {
      const v0 = this.wallV(0.72, 1.2, side, 0.0);
      const v1 = this.wallV(0.72, 1.2, side, 0.05);
      this.box(0.67, 0.78, Math.min(v0, v1), Math.max(v0, v1), 1.15, 1.3, m.teak);
    }
  }

  private buildOverhead() {
    const m = this.mat;
    const o = this.overhead;
    // Teak grab rails / beams across the ceiling.
    for (const u of [0.36, 0.585]) this.box(u, u + 0.012, 0.3, 0.7, CEILING - 0.07, CEILING, m.teakDark, o);
    for (const v of [0.4, 0.6]) this.box(0.36, 0.6, v, v + 0.008, CEILING - 0.05, CEILING, m.teakDark, o);
    // Hatches (bright skylights) and round dome lights.
    this.box(0.45, 0.505, 0.42, 0.58, CEILING - 0.03, CEILING - 0.005, m.glassLight, o);
    this.box(0.535, 0.565, 0.6, 0.67, CEILING - 0.03, CEILING - 0.005, m.glassLight, o);
    this.box(0.7, 0.75, 0.44, 0.56, CEILING - 0.03, CEILING - 0.005, m.glassLight, o);
    for (const [u, v] of [[0.42, 0.35], [0.52, 0.65], [0.56, 0.35], [0.4, 0.62], [0.7, 0.62]]) {
      const lamp = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.1, 0.11, 0.05, 24)), m.domeLight);
      lamp.position.set(X(u), CEILING - 0.025, Z(v));
      o.add(lamp);
    }
    // Portlights in the coachroof sides, with blue curtains.
    const lean = Math.atan2((PROFILE[3][1] - PROFILE[4][1]) * 0.4 * W, CEILING - PROFILE[3][0]);
    const port = (ua: number, ub: number, side: -1 | 1) => {
      const um = (ua + ub) / 2;
      const h = 1.55;
      const z = Z(this.wallV(um, h, side, 0.004));
      const geo = this.keep(new THREE.BoxGeometry(X(ub) - X(ua), 0.24, 0.02));
      const win = new THREE.Mesh(geo, m.glassLight);
      win.position.set(X(um), h, z);
      win.rotation.x = -side * lean;
      o.add(win);
      const curtain = new THREE.Mesh(this.keep(new THREE.BoxGeometry(0.1, 0.3, 0.04)), m.curtain);
      curtain.position.set(X(ub) + 0.08, h, Z(this.wallV(ub, h, side, 0.01)));
      curtain.rotation.x = -side * lean;
      o.add(curtain);
    };
    port(0.44, 0.535, -1);
    port(0.44, 0.535, 1);
    port(0.365, 0.4, 1);
    port(0.375, 0.41, -1);
    port(0.66, 0.7, -1);
    port(0.66, 0.7, 1);
  }

  // ── Pins ────────────────────────────────────────────────────────────────────────────────

  setPins(pins: ScenePin[]) {
    this.pinGroup.clear();
    this.pinHits = [];
    this.pinParts.clear();
    const ballGeo = this.keep(new THREE.SphereGeometry(0.09, 24, 16));
    const hitGeo = this.keep(new THREE.SphereGeometry(0.2, 8, 6));
    const ringGeo = this.keep(new THREE.RingGeometry(0.06, 0.1, 24));
    const hitMat = this.keep(new THREE.MeshBasicMaterial({ visible: false }));

    for (const pin of pins) {
      const h = pinHeight(pin.name);
      // Keep the pin inside the cabin at that height, even if the 2D spot is on the hull line.
      const hb = halfBeam(pin.x) * wallFactor(h) - 0.012;
      const v = Math.min(0.5 + hb, Math.max(0.5 - hb, pin.y));
      const pos = new THREE.Vector3(X(pin.x), h, Z(v));
      const color = new THREE.Color(pin.color);

      const ball = new THREE.Mesh(ballGeo, this.keep(new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.6, roughness: 0.3,
      })));
      ball.position.copy(pos);
      // A faint copy drawn on top of everything, so pins behind furniture still show through.
      const ghost = new THREE.Mesh(ballGeo, this.keep(new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false,
      })));
      ghost.position.copy(pos);
      ghost.renderOrder = 10;

      // Thin drop line and a ring on the floor marking the exact spot from the plan.
      const line = new THREE.Line(
        this.keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(pos.x, 0.01, pos.z), pos])),
        this.keep(new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 })),
      );
      const ring = new THREE.Mesh(ringGeo, this.keep(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pos.x, 0.015, pos.z);

      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.position.copy(pos);
      hit.userData.pinId = pin.id;

      const label = this.labelSprite(pin.name, pin.itemCount);
      label.position.copy(pos).add(new THREE.Vector3(0, 0.2, 0));
      label.visible = this.showNames;

      this.pinGroup.add(line, ring, ball, ghost, hit, label);
      this.pinHits.push(hit);
      this.pinParts.set(pin.id, { ball, ghost, label, pos });
    }
    this.refreshLabels();
  }

  private labelSprite(name: string, count: number) {
    const canvas = document.createElement("canvas");
    const c = canvas.getContext("2d")!;
    const scale = 2;
    const font = `600 ${15 * scale}px -apple-system, system-ui, sans-serif`;
    const small = `400 ${12 * scale}px -apple-system, system-ui, sans-serif`;
    const sub = `${count} item${count === 1 ? "" : "s"}`;
    c.font = font;
    const w1 = c.measureText(name).width;
    c.font = small;
    const w2 = c.measureText(sub).width;
    const pad = 10 * scale;
    canvas.width = Math.ceil(w1 + w2 + pad * 2.8);
    canvas.height = 32 * scale;
    c.fillStyle = "rgba(10,22,40,0.88)";
    c.beginPath();
    c.roundRect(0, 0, canvas.width, canvas.height, 9 * scale);
    c.fill();
    c.fillStyle = "#fff";
    c.textBaseline = "middle";
    c.font = font;
    c.fillText(name, pad, canvas.height / 2);
    c.globalAlpha = 0.7;
    c.font = small;
    c.fillText(sub, pad * 1.8 + w1, canvas.height / 2 + scale);
    const tex = this.keep(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(this.keep(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false })));
    const height = 0.13;
    sprite.scale.set((height * canvas.width) / canvas.height, height, 1);
    sprite.center.set(0.5, 0);
    sprite.renderOrder = 20;
    return sprite;
  }

  setShowNames(show: boolean) {
    this.showNames = show;
    this.refreshLabels();
  }

  select(id: string | null, fly = false) {
    this.selectedId = id;
    this.refreshLabels();
    const part = id ? this.pinParts.get(id) : null;
    if (part && fly) {
      // Swing round to look at the pin from a little way off, staying inside the cabin.
      const toTarget = part.pos.clone();
      const dir = this.camera.position.clone().sub(this.controls.target).setY(0);
      if (dir.lengthSq() < 0.01) dir.set(-1, 0, 0);
      dir.normalize().multiplyScalar(1.6);
      const toPos = toTarget.clone().add(dir).setY(Math.min(1.7, Math.max(1.2, toTarget.y + 0.5)));
      this.flyTo(toPos, toTarget);
    }
  }

  private refreshLabels() {
    for (const [id, p] of this.pinParts) {
      p.label.visible = this.showNames || id === this.selectedId;
      if (id !== this.selectedId) p.ball.scale.setScalar(1);
      p.ghost.visible = true;
    }
  }

  /** Lay the 2D deck layout picture on the floor, to check pins line up. */
  setPlanPicture(url: string | null) {
    if (this.planOverlay) {
      this.scene.remove(this.planOverlay);
      this.planOverlay = null;
    }
    if (!url) return;
    new THREE.TextureLoader().load(url, tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      this.keep(tex);
      const geo = this.keep(new THREE.PlaneGeometry(L, W));
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, this.keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.75, depthWrite: false })));
      mesh.position.y = 0.02;
      mesh.renderOrder = 1;
      this.planOverlay = mesh;
      this.scene.add(mesh);
    }, undefined, () => { /* picture couldn't load (e.g. offline): just skip it */ });
  }

  // ── Camera ──────────────────────────────────────────────────────────────────────────────

  setView(view: ViewName, instant = false) {
    const views: Record<ViewName, [THREE.Vector3, THREE.Vector3]> = {
      forward: [new THREE.Vector3(X(0.36), 1.6, Z(0.53)), new THREE.Vector3(X(0.6), 0.95, Z(0.47))],
      aft: [new THREE.Vector3(X(0.59), 1.6, Z(0.55)), new THREE.Vector3(X(0.34), 0.95, Z(0.5))],
      overhead: this.overheadView(),
    };
    const [pos, target] = views[view];
    if (instant) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
    } else this.flyTo(pos, target);
  }

  /** Straight down on the whole boat: bow to the right on a wide screen (like the 2D plan), bow up on a phone. */
  private overheadView(): [THREE.Vector3, THREE.Vector3] {
    const target = new THREE.Vector3(X(0.51), 0, Z(0.5));
    const wide = this.camera.aspect >= 1;
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    // How far up the camera must be for the ~12 m hull to fit across (wide) or down (tall) the screen.
    const along = wide ? Math.atan(Math.tan(halfFov) * this.camera.aspect) : halfFov;
    const height = 7.6 / Math.tan(along);
    const pos = target.clone().add(wide ? new THREE.Vector3(0, height, 0.05) : new THREE.Vector3(-0.05, height, 0));
    return [pos, target];
  }

  private flyTo(toPos: THREE.Vector3, toTarget: THREE.Vector3) {
    this.flight = { fromPos: this.camera.position.clone(), toPos, fromTarget: this.controls.target.clone(), toTarget, t: 0 };
  }

  // ── Loop, input, sizing ─────────────────────────────────────────────────────────────────

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / 0.7);
      const e = f.t < 0.5 ? 2 * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 2) / 2;
      this.camera.position.lerpVectors(f.fromPos, f.toPos, e);
      this.controls.target.lerpVectors(f.fromTarget, f.toTarget, e);
      if (f.t >= 1) this.flight = null;
    }
    this.controls.update();
    this.rock();
    // Looking down from above the cabin: lift the lid off.
    this.overhead.visible = this.camera.position.y < CEILING - 0.02;
    // The selected pin pulses so it's easy to spot.
    const sel = this.selectedId ? this.pinParts.get(this.selectedId) : null;
    if (sel) {
      const s = 1.4 + 0.45 * Math.sin(this.clock.elapsedTime * 5);
      sel.ball.scale.setScalar(s);
      sel.ghost.scale.setScalar(s);
    }
    this.renderer.render(this.scene, this.camera);
  };

  /** Roll the cabin a degree or so each way, with a slower pitch, like a boat at the dock. */
  private rock() {
    const t = this.clock.elapsedTime;
    const roll = 0.02 * Math.sin((t * 2 * Math.PI) / 6.5) + 0.006 * Math.sin((t * 2 * Math.PI) / 2.9 + 1);
    const up = roll > this.lastRoll;
    if (up !== this.rollingUp) this.onRollPeak(Math.min(1, Math.abs(roll) / 0.026));
    this.rollingUp = up;
    this.lastRoll = roll;
    if (this.rocking) {
      this.scene.rotation.x = roll;
      this.scene.rotation.z = 0.006 * Math.sin((t * 2 * Math.PI) / 8.3);
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
  };

  private onPointerUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return; // that was a drag
    const box = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - box.left) / box.width) * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObjects(this.pinHits, false)[0];
    const id = (hit?.object.userData.pinId as string | undefined) ?? null;
    this.select(id);
    this.onSelect(id);
  };

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 80 : 65; // a wider view on a tall phone screen
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onPointerDown);
    el.removeEventListener("pointerup", this.onPointerUp);
    this.controls.dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    el.remove();
  }
}
