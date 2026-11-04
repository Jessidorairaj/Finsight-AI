-- Migration 006: Add category column to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Others';

