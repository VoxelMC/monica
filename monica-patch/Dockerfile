# orbit's patch to Monica 4.1.2: stop phone sync from creating duplicate people.
# Build from the repository root (the files below are copied from app/):
#   docker build -t monica:4.1.2-orbit1 -f monica-patch/Dockerfile .
# See monica-patch/README.md.
FROM monica:4.1.2-apache
COPY --chown=www-data:www-data app/Services/VCard/ImportVCard.php /var/www/html/app/Services/VCard/ImportVCard.php
COPY --chown=www-data:www-data app/Jobs/Dav/UpdateVCard.php /var/www/html/app/Jobs/Dav/UpdateVCard.php
# Refuse to build if either file has a PHP syntax error
RUN php -l /var/www/html/app/Services/VCard/ImportVCard.php && php -l /var/www/html/app/Jobs/Dav/UpdateVCard.php
LABEL org.opencontainers.image.description="monica:4.1.2-apache + orbit duplicate-contact patch (ImportVCard, UpdateVCard)"
