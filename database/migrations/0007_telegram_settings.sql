-- Migration 0007: Add Telegram notification settings to store_settings
ALTER TABLE store_settings ADD COLUMN telegram_bot_token TEXT;
ALTER TABLE store_settings ADD COLUMN telegram_chat_ids TEXT;
ALTER TABLE store_settings ADD COLUMN telegram_notify_app_launch INTEGER DEFAULT 1;
ALTER TABLE store_settings ADD COLUMN telegram_notify_sale INTEGER DEFAULT 1;
ALTER TABLE store_settings ADD COLUMN telegram_notify_shift INTEGER DEFAULT 1;
