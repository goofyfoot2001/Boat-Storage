import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { Highlight } from "../components/Highlight";
import { Icon } from "../components/Icon";
import { usePhotoUrl } from "../components/usePhotoUrl";
import * as store from "../data/store";
import type { Boat } from "../data/types";
import { formatPrice, plural } from "../lib/format";
import { searchBoat, terms, type ItemHit } from "../lib/search";

/** Search everything stored on one boat. */
export function SearchPage() {
  const { boatId } = useParams();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const [boat, setBoat] = useState<Boat>();
  const [data, setData] = useState<store.BoatContents | null>(null);

  useEffect(() => {
    store.getBoat(boatId!).then(setBoat);
    store.boatContents(boatId!).then(setData);
  }, [boatId]);

  const words = useMemo(() => terms(query), [query]);
  const results = useMemo(() => (data ? searchBoat(data, query) : null), [data, query]);

  return (
    <div className="page">
      <AppHeader backTo={`/boats/${boatId}`} title="Search" subtitle={boat ? `Everything on ${boat.name}` : ""} />

      <section className="list">
        <label className="search-box">
          <Icon name="search" size={18} />
          <input type="search" value={query} autoFocus enterKeyHint="search"
            placeholder="Item, part number, description, price…"
            onChange={e => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })} />
          {query && (
            <button type="button" onClick={() => setParams({}, { replace: true })} aria-label="Clear search">
              <Icon name="x" size={16} />
            </button>
          )}
        </label>

        {!data && <p className="hint centered">Loading…</p>}

        {data && !words.length && (
          <div className="empty">
            <Icon name="search" size={48} />
            <h3>Find anything on {boat?.name ?? "this boat"}</h3>
            <p>Type any word or number: an item, a part number, a price, or a location like "port locker". Several words narrow it down.</p>
          </div>
        )}

        {results && words.length > 0 && (
          <>
            {results.places.length > 0 && (
              <>
                <h2 className="section-title">Locations</h2>
                <div className="card">
                  {results.places.map(({ place, itemCount }) => (
                    <Link key={place.id} to={`/locations/${place.id}`} className="loc-row">
                      <span className="loc-swatch" style={{ background: place.color }} />
                      <span className="grow"><Highlight text={place.name} words={words} /> <span className="muted">· {place.deckName}</span></span>
                      <span className="muted">{plural(itemCount, "item")}</span>
                      <Icon name="chevron-right" size={16} color="var(--muted)" />
                    </Link>
                  ))}
                </div>
              </>
            )}

            {results.containers.length > 0 && (
              <>
                <h2 className="section-title">Containers</h2>
                <div className="card">
                  {results.containers.map(({ container, place, path, itemCount }) => (
                    <Link key={container.id} to={`/locations/${place.id}?container=${container.id}`} className="loc-row">
                      <span className="box-tag" style={{ background: container.color }}><Icon name="box" size={13} color="#fff" /></span>
                      <span className="grow">
                        <Highlight text={container.name} words={words} />
                        <span className="muted"> · {[place.name, ...path.map(p => p.name)].join(" › ")}</span>
                      </span>
                      <span className="muted">{plural(itemCount, "item")}</span>
                      <Icon name="chevron-right" size={16} color="var(--muted)" />
                    </Link>
                  ))}
                </div>
              </>
            )}

            <h2 className="section-title">{plural(results.items.length, "item")} found</h2>
            {results.items.length === 0 && (
              <p className="hint centered">Nothing matches “{query.trim()}”. Try fewer or shorter words.</p>
            )}
            {results.items.map(hit => <ResultRow key={hit.item.id} hit={hit} words={words} />)}
          </>
        )}
      </section>
    </div>
  );
}

function ResultRow({ hit: { item, place, path }, words }: { hit: ItemHit; words: string[] }) {
  const photo = usePhotoUrl(item.photoPath);
  return (
    <Link to={`/locations/${place.id}?item=${item.id}`} className="card result">
      <div className="thumb result-thumb">{photo ? <img src={photo} alt="" /> : <Icon name="map-pin" size={20} />}</div>
      <div className="card-text">
        <h3><Highlight text={item.name} words={words} /></h3>
        <p className="result-place">
          <span className="loc-swatch" style={{ background: place.color }} />
          <span>
            <Highlight text={place.name} words={words} />
            {path.map(c => <span key={c.id}> › <Highlight text={c.name} words={words} /></span>)}
            {" · "}<Highlight text={place.deckName} words={words} />
          </span>
        </p>
        <p>
          Qty {item.quantity}
          {item.price != null && <> · <Highlight text={formatPrice(item.price)} words={words} /> each</>}
        </p>
        {item.notes && <p className="result-notes"><Highlight text={item.notes} words={words} /></p>}
      </div>
      <Icon name="chevron-right" size={18} color="var(--muted)" />
    </Link>
  );
}
