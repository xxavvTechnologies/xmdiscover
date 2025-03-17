-- Create buckets with appropriate policies
begin;
  -- Public images bucket
  insert into storage.buckets (id, name, public) 
  values ('images', 'images', true);

  -- Private audio bucket
  insert into storage.buckets (id, name, public) 
  values ('audio', 'audio', false);
commit;

-- Policy for public images bucket (allow anyone to view)
create policy "Public Access" 
  on storage.objects for select 
  using ( bucket_id = 'images' );

-- Policies for private audio bucket
create policy "Auth users can select audio"
  on storage.objects for select
  using (
    bucket_id = 'audio'
    and auth.role() = 'authenticated'
  );

create policy "Only admins can insert audio"
  on storage.objects for insert
  with check (
    bucket_id = 'audio'
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'admin'
    )
  );

  -- Add storage bucket policies
-- Public images bucket
create policy "Public Access" 
on storage.objects for select 
using ( bucket_id = 'images' );

create policy "Authenticated users can upload images"
on storage.objects for insert
with check (
    bucket_id = 'images'
    and auth.role() = 'authenticated'
    and (auth.jwt() ->> 'role' = 'admin' 
        or exists (
            select 1 from public.profiles 
            where id = auth.uid() 
            and role = 'admin'
        )
    )
);

-- Private audio bucket
create policy "Admin users can upload audio"
on storage.objects for insert
with check (
    bucket_id = 'audio'
    and (auth.jwt() ->> 'role' = 'admin' 
        or exists (
            select 1 from public.profiles 
            where id = auth.uid() 
            and role = 'admin'
        )
    )
);

-- Enable Row Level Security on all tables
alter table public.profiles enable row level security;
alter table public.artists enable row level security;
alter table public.albums enable row level security;
alter table public.songs enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_songs enable row level security;
alter table public.exclusive_content enable row level security;
alter table public.likes enable row level security;

-- Create storage bucket policies
create policy "Images are publicly accessible"
on storage.objects for select
using ( bucket_id = 'images' );

create policy "Authenticated users can upload images"
on storage.objects for insert
with check (
    bucket_id = 'images' 
    and auth.role() = 'authenticated'
);

create policy "Audio files are publicly accessible"
on storage.objects for select
using ( bucket_id = 'audio' );

create policy "Admin users can upload audio"
on storage.objects for insert
with check (
    bucket_id = 'audio'
    and exists(
        select 1 from public.profiles
        where id = auth.uid()
        and role = 'admin'
    )
);

-- Create tables first
create table if not exists public.profiles (
    id uuid primary key references auth.users,
    username text unique,
    display_name text,
    avatar_url text,
    role text default 'user'
);

create table if not exists public.artists (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    bio text,
    image_url text,
    genres text[],
    status text default 'published',
    created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.albums (
    id uuid primary key default uuid_generate_v4(),
    title text not null,
    artist_id uuid references public.artists(id) on delete cascade,
    cover_url text,
    release_date date,
    type text default 'album',
    status text default 'published',
    created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.songs (
    id uuid primary key default uuid_generate_v4(),
    title text not null,
    artist_id uuid references public.artists(id) on delete cascade,
    album_id uuid references public.albums(id) on delete set null,
    audio_url text,
    cover_url text,
    duration interval,
    track_number integer,
    status text default 'published',
    created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.playlists (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    description text,
    cover_url text,
    creator_id uuid references public.profiles(id) on delete cascade,
    is_public boolean default true,
    featured boolean default false,
    status text default 'published',
    created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.playlist_songs (
    id uuid primary key default uuid_generate_v4(),
    playlist_id uuid references public.playlists(id) on delete cascade,
    song_id uuid references public.songs(id) on delete cascade,
    position integer,
    created_at timestamp with time zone default timezone('utc'::text, now()),
    unique(playlist_id, song_id)
);

create table if not exists public.likes (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references public.profiles(id) on delete cascade,
    song_id uuid references public.songs(id) on delete cascade,
    created_at timestamp with time zone default timezone('utc'::text, now()),
    unique(user_id, song_id)
);

create table if not exists public.play_history (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references public.profiles(id) on delete cascade,
    song_id uuid references public.songs(id) on delete cascade,
    played_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.artists enable row level security;
alter table public.albums enable row level security;
alter table public.songs enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_songs enable row level security;
alter table public.likes enable row level security;
alter table public.play_history enable row level security;

-- Playlist policies
create policy "Users can view public playlists"
on public.playlists for select
using (
    is_public = true 
    or creator_id = auth.uid()
);

create policy "Users can create their own playlists"
on public.playlists for insert
with check (creator_id = auth.uid());

create policy "Users can update their own playlists"
on public.playlists for update
using (creator_id = auth.uid());

create policy "Users can delete their own playlists"
on public.playlists for delete
using (creator_id = auth.uid());

-- Like policies
create policy "Users can view likes"
on public.likes for select
using (user_id = auth.uid());

create policy "Users can create likes"
on public.likes for insert
with check (user_id = auth.uid());

create policy "Users can delete their likes"
on public.likes for delete
using (user_id = auth.uid());

-- Play history policies
create policy "Users can view their play history"
on public.play_history for select
using (user_id = auth.uid());

create policy "Users can create play history entries"
on public.play_history for insert
with check (user_id = auth.uid());

-- Like policies
DROP POLICY IF EXISTS "Users can view likes" ON public.likes;
DROP POLICY IF EXISTS "Users can create likes" ON public.likes;
DROP POLICY IF EXISTS "Users can delete their likes" ON public.likes;

CREATE POLICY "Users can view likes"
ON public.likes FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create likes"
ON public.likes FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their likes"
ON public.likes FOR DELETE
USING (user_id = auth.uid());

-- Recreate the likes table properly
DROP TABLE IF EXISTS public.likes;

CREATE TABLE IF NOT EXISTS public.likes (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    song_id uuid REFERENCES public.songs ON DELETE CASCADE NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    UNIQUE(user_id, song_id)
);

-- Add indices for performance
CREATE INDEX IF NOT EXISTS likes_user_id_idx ON public.likes(user_id);
CREATE INDEX IF NOT EXISTS likes_song_id_idx ON public.likes(song_id);

-- Enable RLS
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

-- Add policies
CREATE POLICY "Users can view their own likes"
ON public.likes FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create likes"
ON public.likes FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own likes"
ON public.likes FOR DELETE
USING (user_id = auth.uid());

-- Drop existing songs table and recreate with updated schema
drop table if exists public.songs cascade;

create table if not exists public.songs (
    id uuid primary key default uuid_generate_v4(),
    title text not null,
    artist_id uuid references public.artists(id) on delete cascade,
    album_id uuid references public.albums(id) on delete set null,
    type text default 'track', -- single, album_track, ep
    audio_url text,
    cover_url text,
    duration interval,
    track_number integer,
    status text default 'published',
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Add popularity column to artists
alter table public.artists 
    add column if not exists popularity integer default 0;

-- Add public read policies for content
create policy "Anyone can view published artists"
    on public.artists for select
    using (status = 'published');

create policy "Anyone can view published albums"
    on public.albums for select
    using (status = 'published');

create policy "Anyone can view published songs"
    on public.songs for select
    using (status = 'published');

create policy "Anyone can view published playlists"
    on public.playlists for select
    using (
        status = 'published' 
        and (is_public = true or creator_id = auth.uid())
    );

-- Like policies
drop policy if exists "Users can view likes" on public.likes;
create policy "Users can only view their own likes"
on public.likes for select
using (user_id = auth.uid());

-- Add unique constraint for podcast feed_url
create unique index if not exists podcasts_feed_url_key on public.podcasts (feed_url);