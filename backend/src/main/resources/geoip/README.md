# GeoLite2 Database

Place `GeoLite2-Country.mmdb` in this directory to enable IP geolocation.

Download from: https://www.maxmind.com/en/geolite2/signup (free account required).
Select "GeoLite2 Country" in binary (MMDB) format.

Without this file the application starts normally; login events are recorded with `country=null` and `region=null`.
