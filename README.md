# Online Examination Portal
React + Supabase online exam system with Admin, Teacher, Student roles.

## Run locally
1. Create a Supabase project.
2. Open Supabase SQL Editor and run `supabase/schema.sql`.
3. Create demo users in Supabase Auth or register from the app.
4. Run `supabase/seed.sql` after replacing demo UUIDs with actual Auth user IDs where marked.
5. Copy `.env.example` to `.env` and add Supabase URL and anon key.
6. Install and run:
```bash
npm install
npm run dev
```

