import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

export const privacyUuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export async function privacyDatabase() {
    const db = await PGlite.create();
    await db.exec(`CREATE ROLE fixture_superuser SUPERUSER; SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE;
      ALTER ROLE postgres RENAME TO fixture_bootstrap;
      CREATE ROLE postgres LOGIN NOSUPERUSER BYPASSRLS CREATEROLE CREATEDB;
      GRANT CREATE ON DATABASE postgres TO postgres; ALTER SCHEMA public OWNER TO postgres;
      CREATE ROLE supabase_auth_admin;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticator;
      CREATE ROLE crawler_writer; CREATE ROLE crawler_customer_reader; CREATE ROLE property_finder_web_reader LOGIN NOINHERIT;
      GRANT crawler_customer_reader TO property_finder_web_reader;
      CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),
        email_confirmed_at timestamptz,last_sign_in_at timestamptz,deleted_at timestamptz,is_anonymous boolean DEFAULT false,
        banned_until timestamptz,encrypted_password text DEFAULT 'NEVER_EXPORT_PASSWORD',recovery_token text DEFAULT 'NEVER_EXPORT_TOKEN');
      CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,not_after timestamptz);
      ALTER TABLE auth.users OWNER TO supabase_auth_admin; ALTER TABLE auth.sessions OWNER TO supabase_auth_admin;
      ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY; ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA auth TO postgres; GRANT SELECT,UPDATE,DELETE,REFERENCES ON auth.users,auth.sessions TO postgres;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT COALESCE(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
      CREATE SCHEMA storage; CREATE TABLE storage.objects(id uuid PRIMARY KEY,owner uuid,owner_id text);
      GRANT USAGE ON SCHEMA storage TO postgres; GRANT SELECT ON storage.objects TO postgres;
      CREATE TABLE auth.scim_users(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL);
      GRANT SELECT ON auth.scim_users TO postgres;
      SET SESSION AUTHORIZATION postgres; RESET ROLE;
      CREATE SCHEMA crawler; CREATE TABLE crawler.properties(id uuid PRIMARY KEY,first_discovered_at timestamptz DEFAULT now(),
        municipality text DEFAULT 'Myoko',original_pdf_url text DEFAULT 'https://www.city.myoko.niigata.jp/fs/example.pdf');
      CREATE SCHEMA property_api; CREATE VIEW property_api.customer_properties WITH(security_invoker=true,security_barrier=true) AS SELECT id FROM crawler.properties;
      ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO authenticated,service_role;
      ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
    `);
    await db.exec(readFileSync('sql/proposals/001_finder_membership_foundation.sql', 'utf8'));
    await db.exec(readFileSync('sql/proposals/002_finder_accounts.sql', 'utf8'));
    const saved = readFileSync('sql/proposals/003_finder_saved_properties.sql', 'utf8');
    await db.exec(saved.slice(saved.indexOf('CREATE TABLE finder_security.saved_properties'), saved.indexOf('-- Trusted backend only')));
    await db.exec(`CREATE TABLE finder_security.saved_api_settings(singleton boolean PRIMARY KEY DEFAULT true,customer_access_enabled boolean NOT NULL DEFAULT false);
      INSERT INTO finder_security.saved_api_settings VALUES(true,false);
      CREATE FUNCTION finder_security.saved_visible_properties(p_ids uuid[]) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
       SELECT COALESCE(jsonb_agg(jsonb_build_object('listing_id',p.id,'municipality',p.municipality,'original_pdf_url',p.original_pdf_url)),'[]') FROM crawler.properties p
      $$;`);
    const https = readFileSync('sql/proposals/005_finder_supabase_https.sql', 'utf8');
    await db.exec(https.slice(https.indexOf('CREATE FUNCTION finder_security.api_account_snapshot()'), https.indexOf('ALTER FUNCTION finder_security.api_account_snapshot()')));
    await db.exec(readFileSync('sql/proposals/006_finder_property_alerts.sql', 'utf8'));
    await db.exec('SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE');
    return db;
}
