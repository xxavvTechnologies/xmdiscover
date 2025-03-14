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