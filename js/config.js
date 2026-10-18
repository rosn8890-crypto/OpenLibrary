/* =====================================================
   config.js  -  the ONLY file you must edit to connect
   the website with your Supabase database.

   Where to find these two values:
   Supabase Dashboard -> Project Settings -> API
   (use the "anon / public" key, NEVER the service_role key)
   ===================================================== */
const SUPABASE_URL = "https://gpvlvbkijknnrxdoinfb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwdmx2YmtpamtubnJ4ZG9pbmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4MDM3NTcsImV4cCI6MjEwNTM3OTc1N30.h2AHL_cDT4e3fxs6-2Bnqnr2gDBy6ilG4UsRCsPMx9U";

// "db" is the connection object. Every page uses it to talk to the database.
const isConfigured = !SUPABASE_URL.includes("YOUR-PROJECT");
const db = isConfigured ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
