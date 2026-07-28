# Association-file capacity

Apple AASA and Android Asset Links documents are public trust files, not
unbounded app catalogs. Relay loads active apps in stable, paginated order so it
never silently publishes only the first database page. It then serializes the
platform-specific projection and refuses documents larger than 128 KiB with a
non-cacheable 503 response.

The limit is a trust-safety boundary, not a Community app quota. Apps without a
complete identifier for a platform do not occupy that platform's document.
Community operators with many mobile identities should split them across
workspace hostnames, keep identifiers concise, and monitor:

- the byte size and HTTP status of both `/.well-known` responses;
- application additions that approach the limit;
- CDN behavior, ensuring it does not cache a 503 as a successful trust file; and
- physical-device association checks after every identity or hostname change.

Cloud plan limits normally keep each workspace well below the document boundary.
An operator must still alert on oversized responses because increasing a plan
limit or importing legacy data can violate that assumption.
