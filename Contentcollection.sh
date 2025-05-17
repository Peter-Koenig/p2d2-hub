#!/bin/bash

# Nicht mehr benötigte Dateien und Ordner löschen
for path in footer-links.md footer-meta.md social-media.md call-to-action.md community-benefits.md mission.md socialmedia intern legal repositories resources copyright testimonials themenbereiche
do
  if [ -d "src/content/$path" ]; then
    rm -rf "src/content/$path"
    echo "Ordner gelöscht: src/content/$path"
  elif [ -f "src/content/$path" ]; then
    rm "src/content/$path"
    echo "Datei gelöscht: src/content/$path"
  fi
done

# Verzeichnisse neu anlegen
mkdir -p src/content/socialmedia \
         src/content/intern \
         src/content/resources \
         src/content/repositories \
         src/content/legal \
         src/content/copyright \
         src/content/themenbereiche \
         src/content/testimonials

# Social Media
cat <<EOT > src/content/socialmedia/mastodon.md
---
name: Mastodon
url: https://mastodon.social/@publicdata
icon: mastodon
---
EOT

cat <<EOT > src/content/socialmedia/friendica.md
---
name: Friendica
url: https://friendica.example.org/profile/publicdata
icon: friendica
---
EOT

cat <<EOT > src/content/socialmedia/peertube.md
---
name: PeerTube
url: https://peertube.example.org/accounts/publicdata
icon: peertube
---
EOT

cat <<EOT > src/content/socialmedia/pixelfed.md
---
name: Pixelfed
url: https://pixelfed.example.org/publicdata
icon: pixelfed
---
EOT

# Interne Seiten
cat <<EOT > src/content/intern/ueberuns.md
---
name: Über uns
url: /ueber-uns
---
EOT

cat <<EOT > src/content/intern/mission.md
---
name: Mission
url: /mission
---
EOT

cat <<EOT > src/content/intern/team.md
---
name: Team
url: /team
---
EOT

cat <<EOT > src/content/intern/partner.md
---
name: Partner
url: /partner
---
EOT

# Ressourcen
cat <<EOT > src/content/resources/api.md
---
name: API-Dokumentation
url: /api
---
EOT

cat <<EOT > src/content/resources/datenportal.md
---
name: Datenportal
url: /datenportal
---
EOT

# Repositories
cat <<EOT > src/content/repositories/opencode.md
---
name: openCode.de
url: https://opencode.de/publicdata
---
EOT

cat <<EOT > src/content/repositories/gitlab.md
---
name: GitLab
url: https://gitlab.com/publicdata
---
EOT

# Rechtliches
cat <<EOT > src/content/legal/datenschutz.md
---
name: Datenschutz
url: /datenschutz
---
EOT

cat <<EOT > src/content/legal/impressum.md
---
name: Impressum
url: /impressum
---
EOT

cat <<EOT > src/content/legal/lizenzen.md
---
name: Lizenzen
url: /lizenzen
---
EOT

# Copyright
cat <<EOT > src/content/copyright/copyright.md
---
text: "Public-Public Data-DNA © 2025"
---
EOT

# Beispiel-Themenbereiche
cat <<EOT > src/content/themenbereiche/friedhoefe.md
# Friedhöfe
Beschreibung der Friedhöfe...
EOT

cat <<EOT > src/content/themenbereiche/stadtbaeume.md
# Stadtbäume
Beschreibung der Stadtbäume...
EOT

cat <<EOT > src/content/themenbereiche/gemeinschaftsgaerten.md
# Gemeinschaftsgärten
Beschreibung der Gemeinschaftsgärten...
EOT

# Beispiel-Testimonials
cat <<EOT > src/content/testimonials/osm-mapper.md
# OSM Mapper
Zitat und Beschreibung...
EOT

cat <<EOT > src/content/testimonials/gemeinde.md
# Gemeinde
Zitat und Beschreibung...
EOT

cat <<EOT > src/content/testimonials/lehrer.md
# Lehrer
Zitat und Beschreibung...
EOT

cat <<EOT > src/content/testimonials/mapper.md
# Mapper
Zitat und Beschreibung...
EOT

