FROM dunglas/frankenphp:1-php8.4-alpine AS runner

# Install pdo_sqlite extension (usually included, ensure it's available)
RUN install-php-extensions pdo_sqlite opcache

# Production PHP settings
RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
    && echo "opcache.enable=1" >> "$PHP_INI_DIR/php.ini" \
    && echo "opcache.memory_consumption=16" >> "$PHP_INI_DIR/php.ini" \
    && echo "opcache.interned_strings_buffer=4" >> "$PHP_INI_DIR/php.ini" \
    && echo "opcache.max_accelerated_files=2000" >> "$PHP_INI_DIR/php.ini" \
    && echo "opcache.validate_timestamps=0" >> "$PHP_INI_DIR/php.ini" \
    && echo "memory_limit=32M" >> "$PHP_INI_DIR/php.ini"

WORKDIR /app

# Copy application files
COPY . /app

# Configure permissions for SQLite database directory
RUN mkdir -p /app/database && chown -R www-data:www-data /app

ENV PORT=80 \
    APP_ENV=production

USER www-data

CMD ["frankenphp", "run", "--config", "/app/Caddyfile"]
