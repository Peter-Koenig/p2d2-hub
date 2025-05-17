# Verzeichnisse anlegen
mkdir -p src/content/socialmedia \
         src/content/intern \
         src/content/resources \
         src/content/repositories \
         src/content/legal \
         src/content/copyright \
         src/content/themenbereiche \
         src/content/testimonials

# Social Media
echo '---\nname: Mastodon\nurl: https://mastodon.social/@publicdata\nicon: mastodon\n---' > src/content/socialmedia/mastodon.md
echo '---\nname: Friendica\nurl: https://friendica.example.org/profile/publicdata\nicon: friendica\n---' > src/content/socialmedia/friendica.md
echo '---\nname: PeerTube\nurl: https://peertube.example.org/accounts/publicdata\nicon: peertube\n---' > src/content/socialmedia/peertube.md
echo '---\nname: Pixelfed\nurl: https://pixelfed.example.org/publicdata\nicon: pixelfed\n---' > src/content/socialmedia/pixelfed.md

# Interne Seiten
echo '- name: Über uns\n  url: /ueber-uns\n- name: Mission\n  url: /mission\n- name: Team\n  url: /team\n- name: Partner\n  url: /partner' > src/content/intern/intern.md

# Ressourcen
echo '- name: API-Dokumentation\n  url: /api\n- name: Datenportal\n  url: /datenportal' > src/content/resources/resources.md

# Repositories
echo '- name: openCode.de\n  url: https://opencode.de/publicdata\n- name: GitLab\n  url: https://gitlab.com/publicdata' > src/content/repositories/repositories.md

# Rechtliches
echo '- name: Datenschutz\n  url: /datenschutz\n- name: Impressum\n  url: /impressum\n- name: Lizenzen\n  url: /lizenzen' > src/content/legal/legal.md

# Copyright
echo '---\ntext: "Public-Public Data-DNA © 2025"\n---' > src/content/copyright/copyright.md

# Beispiel-Themenbereiche
echo '# Friedhöfe\nBeschreibung der Friedhöfe...' > src/content/themenbereiche/friedhoefe.md
echo '# Stadtbäume\nBeschreibung der Stadtbäume...' > src/content/themenbereiche/stadtbaeume.md
echo '# Gemeinschaftsgärten\nBeschreibung der Gemeinschaftsgärten...' > src/content/themenbereiche/gemeinschaftsgaerten.md

# Beispiel-Testimonials
echo '# OSM Mapper\nZitat und Beschreibung...' > src/content/testimonials/osm-mapper.md
echo '# Gemeinde\nZitat und Beschreibung...' > src/content/testimonials/gemeinde.md
echo '# Lehrer\nZitat und Beschreibung...' > src/content/testimonials/lehrer.md

