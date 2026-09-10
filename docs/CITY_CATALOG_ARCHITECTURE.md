# Atlas Canonical City Catalog

Status: **implemented in code; activation requires deployment of the updated city callable to the target Firebase project**.

## 1. Decision

Atlas treats cities as durable global reference entities instead of treating every autocomplete response as disposable provider output.

The city search path is now conceptually:

```text
browser cache
  -> Atlas city query projection
     -> fresh: return Atlas city snapshots
     -> stale/miss: Geoapify Search
        -> normalize/dedupe/localize
        -> upsert Atlas canonical cities
        -> refresh query projection
        -> return Atlas city snapshots
```

Geoapify remains the discovery and revalidation provider. It is not the identity authority of a saved Atlas trip.

## 2. International reference pattern

This evolution follows a common travel-platform pattern rather than inventing a one-off Atlas convention:

- Booking.com Demand API documents locations as reference data and recommends storing infrequently changing reference data locally and reusing it across requests.
- Expedia Rapid Geography exposes stable region identifiers and geographic definitions at large scale; its documentation also supports integrators maintaining their own geographic definitions/mappings.
- Geoapify explicitly permits caching/storing geocoding results under its terms, with source attribution requirements.

Official references:

- https://developers.booking.com/demand/docs/development-guide/application-flows/content-only
- https://developers.expediagroup.com/rapid/lodging/geography/about-geography-api
- https://www.geoapify.com/geocoding-api/
- https://www.geoapify.com/terms-and-conditions/

Atlas does **not** claim to reproduce Booking or Expedia internals. The reference is the public architectural pattern: stable location entities + reusable reference data + provider-backed discovery/refresh.

## 3. Fit with Atlas Storage v4

This catalog does not change the canonical Storage v4 trip topology:

```text
users/{uid}/trips/{tripId}
  segments/{segmentId}
  places/{placeId}
  connections/{connectionId}
  notes/{noteId}
  checklist/{itemId}
```

A segment still stores its City snapshot inline. The allowed City contract remains:

```text
id
name
displayName
country
countryCode
lat
lon
```

This is deliberate:

- a saved trip remains loadable without a catalog lookup;
- historical trips are not rewritten when reference metadata evolves;
- region/provider/attribution/internal catalog fields do not leak into user canonical data;
- Storage v4 Rules require no schema expansion for this evolution.

The `id` field remains opaque to trip consumers. Existing trips may contain historical provider IDs. New selections can contain an Atlas catalog city ID. No forced whole-trip migration is required.

## 4. Server-only Firestore model

The catalog is internal application reference data in `(default)`, separate from provider cache semantics and separate from `users/{uid}` canonical data.

```text
cityCatalog/{atlasCityId}
cityCatalogProviderRefs/{providerRefHash}
cityCatalogQueries/{queryFingerprint}
```

### `cityCatalog/{atlasCityId}`

Durable master reference:

```text
schemaVersion
id
status
names.{locale}
defaultName
countryCode
countryNames.{locale}
region.name
region.code
lat
lon
providerRefs.geoapify
sourceAttribution.geoapify
createdAt
updatedAt
verifiedAt
```

`atlasCityId` is a Firestore-generated opaque ID. It is not derived from Geoapify, a city name, or coordinates. This prevents provider identity from becoming Atlas identity.

### `cityCatalogProviderRefs/{providerRefHash}`

Provider-to-Atlas mapping:

```text
schemaVersion
provider
providerId
cityId
createdAt
updatedAt
```

The document ID is SHA-256 derived from provider namespace + provider ID. Concurrent first discoveries use a Firestore transaction so the provider mapping is the serialization point and duplicate Atlas IDs are not intentionally created for the same provider entity.

### `cityCatalogQueries/{queryFingerprint}`

Materialized search projection:

```text
schemaVersion
language
provider
resultCount
results[<=5]
verifiedAt
revalidateAfter
updatedAt
```

The query text is not stored. The document ID is a SHA-256 fingerprint of schema version + locale + normalized query. This keeps raw user search text out of the reference collection.

The projection contains small Atlas City snapshots so a catalog hit is one server-side Firestore read rather than one projection read plus N city reads.

## 5. Freshness and provider fallback

The catalog is reference data, **not TTL cache data**.

- Browser city cache remains bounded and disposable.
- `citySearchCache` remains provider cache with its existing 60-day TTL semantics.
- `cityCatalogQueries` has no `expiresAt` and is not placed in the TTL manifest.
- Query projections are revalidated after 180 days.
- A stale projection remains usable only as a provider-outage fallback.

This gives Atlas a stable reference layer without pretending geographic reference data never changes.

## 6. Search quality

Geoapify remains responsible for first discovery/ranking of a query that Atlas has not resolved before. Atlas retains the existing protections:

- `type=city`;
- maximum 5 results;
- worldwide-neutral `bias=countrycode:none`;
- `es|en` localization;
- provider rank/confidence validation;
- aliases and multilingual deduplication;
- same-country homonym preservation;
- UI display as `City, Country`.

The catalog stores the normalized provider-ranked projection for subsequent reuse. Atlas therefore does not introduce an inferior home-grown full-text ranker merely to avoid a provider call.

A future dedicated search engine may replace the query-projection adapter without changing the City contract or trip persistence contract.

## 7. Security

The frontend never reads or writes the catalog directly.

All access is through `geoapifyCityAutocomplete` using Firebase Admin server-side access. Existing Firestore catch-all deny rules keep these global internal collections inaccessible to authenticated and anonymous clients.

Security tests explicitly cover:

- `cityCatalog` client read/write denied;
- `cityCatalogProviderRefs` client read/write denied;
- `cityCatalogQueries` client read/write denied.

Provider secrets remain in Firebase Secret Manager and are not stored in catalog documents, query projections, browser caches or logs.

Structured city-catalog metrics do not log raw queries.

## 8. Performance and scalability

The hot path for an already-known query is:

```text
1 callable invocation
1 Firestore projection read
0 Geoapify credits
```

The discovery path is:

```text
1 catalog projection read
shared provider cache lookup
0 or 1 Geoapify request
<=5 transactional city/provider-ref upserts
1 projection write
```

The provider upserts run concurrently and each provider reference is independently transactional. There is no global city counter, global lock, prefix hotspot document or whole-catalog rewrite.

The projection stores at most five small City snapshots. It avoids N+1 reads on the normal catalog-hit path.

The catalog is progressive: Atlas stores cities/searches that users actually resolve instead of preloading the entire planet before product demand exists.

## 9. Failure behavior

The catalog is fail-soft:

- catalog read failure -> provider path remains available;
- catalog write failure -> normalized provider results remain usable;
- stale catalog + provider failure -> stale canonical projection is served;
- catalog failure never converts a keystroke into a trip write;
- a provider outage does not corrupt canonical trip data.

No raw provider payload is persisted as user data.

## 10. Attribution

Geoapify permits storing geocoding results but requires source attribution according to its terms/data-source requirements.

Atlas therefore preserves sanitized datasource attribution metadata on the canonical city reference (`sourceAttribution`) while keeping it out of the user City snapshot.

Any additional plan-specific visible Geoapify attribution requirement remains a product/compliance concern and must be satisfied independently of this storage design.

## 11. Compatibility and migration

There is no destructive migration for existing trips.

Compatibility policy:

1. existing provider-derived City IDs remain valid opaque IDs;
2. new catalog-backed selections return Atlas city IDs;
3. City consumers must not infer provider from `city.id`;
4. provider identity belongs only in `cityCatalogProviderRefs/providerRefs`;
5. a future optional backfill can map historical Geoapify IDs through provider refs, but it is not required for correctness and must not rewrite trips merely for cosmetic uniformity.

This is the safest rollout because saved trips already contain the complete coordinates/name/country snapshot they need.

## 12. Cache/version implications

The city provider payload now includes attribution metadata needed to materialize catalog entries, and result IDs can change from provider IDs to Atlas IDs.

Therefore both city caches are versioned to v8:

```text
server provider cache: city:v8:...
browser cache: atlas:geoapify-city-cache:v8
```

Old v7 data is not reused across this identity boundary.

## 13. Deployment implications

Code merge alone does not activate this behavior in a local frontend configured with `VITE_FIREBASE_USE_EMULATORS=false`.

The updated callable must be deployed to the target Firebase project. No new public endpoint is introduced and no Firestore Rules expansion is required.

No composite Firestore index is required by the v1 catalog implementation because lookups use deterministic document IDs.

## 14. Explicit non-goals

This implementation intentionally does not:

- preload every city in the world;
- expose the catalog to direct browser Firestore reads;
- replace Geoapify with a home-grown geocoder;
- store provider payloads inside trips;
- force a v4 trip schema migration;
- infer provider identity from Atlas city IDs;
- add a global prefix-index hotspot;
- claim permanent freshness for city/reference metadata.
