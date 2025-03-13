-- Enable RLS on all tables
alter table auth.users enable row level security;

-- Create custom types
create type content_status as enum ('draft', 'published', 'archived');
create type user_role as enum ('admin', 'artist', 'user');

-- Create profiles table
create table public.profiles (
    id uuid references auth.users on delete cascade primary key,
    username text unique not null,
    display_name text,
    avatar_url text,
    role user_role default 'user',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Create artists table
create table public.artists (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    bio text,
    image_url text,
    genres text[],
    verified boolean default false,
    status content_status default 'published',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Create albums table
create table public.albums (
    id uuid primary key default uuid_generate_v4(),
    title text not null,
    artist_id uuid references public.artists(id) on delete cascade,
    cover_url text,
    release_date date,
    genres text[],
    status content_status default 'published',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Create songs table
create table public.songs (
    id uuid primary key default uuid_generate_v4(),
    title text not null,
    artist_id uuid references public.artists(id) on delete cascade,
    album_id uuid references public.albums(id) on delete set null,
    duration interval not null,
    audio_url text not null,
    track_number int,
    genres text[],
    status content_status default 'published',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Create playlists table
create table public.playlists (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    description text,
    cover_url text,
    creator_id uuid references public.profiles(id) on delete cascade,
    is_public boolean default true,
    status content_status default 'published',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Create playlist_songs junction table
create table public.playlist_songs (
    playlist_id uuid references public.playlists(id) on delete cascade,
    song_id uuid references public.songs(id) on delete cascade,
    position int not null,
    added_at timestamptz default now(),
    primary key (playlist_id, song_id)
);

-- Create exclusive_content table
create table public.exclusive_content (
    id uuid primary key default uuid_generate_v4(),
    title text not null,
    description text,
    content_url text not null,
    artist_id uuid references public.artists(id) on delete cascade,
    type text not null,
    status content_status default 'published',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Create likes table for tracking user likes
create table public.likes (
    user_id uuid references public.profiles(id) on delete cascade,
    content_type text not null,
    content_id uuid not null,
    created_at timestamptz default now(),
    primary key (user_id, content_type, content_id)
);

-- Row Level Security Policies

-- Profiles: viewable by everyone, editable by owner and admins
create policy "Profiles are viewable by everyone"
    on public.profiles for select
    using (true);

create policy "Users can insert their own profile"
    on public.profiles for insert
    with check (auth.uid() = id);

create policy "Users can update own profile"
    on public.profiles for update using (
        auth.uid() = id or 
        exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
    );

-- Add policy to allow users to delete their own profile
create policy "Users can delete own profile"
    on public.profiles for delete using (auth.uid() = id);

-- Add policy for admins to delete any profile
create policy "Admins can delete any profile"
    on public.profiles for delete using (
        exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
    );

-- Artists: viewable by everyone, manageable by admins
create policy "Artists are viewable by everyone"
    on public.artists for select
    using (true);

create policy "Artists are manageable by admins"
    on public.artists for all using (
        exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
    );

-- Albums: similar to artists
create policy "Albums are viewable by everyone"
    on public.albums for select
    using (true);

create policy "Albums are manageable by admins"
    on public.albums for all using (
        exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
    );

-- Songs: similar pattern
create policy "Songs are viewable by everyone"
    on public.songs for select
    using (true);

create policy "Songs are manageable by admins"
    on public.songs for all using (
        exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
    );

-- Playlists: public ones viewable by everyone, private by owner
create policy "Public playlists are viewable by everyone"
    on public.playlists for select
    using (is_public or auth.uid() = creator_id);

create policy "Users can create playlists"
    on public.playlists for insert
    with check (auth.uid() = creator_id);

create policy "Users can update own playlists"
    on public.playlists for update using (
        auth.uid() = creator_id or 
        exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
    );

-- Playlist songs: same rules as playlists
create policy "Playlist songs viewable with playlist"
    on public.playlist_songs for select using (
        exists(
            select 1 from public.playlists 
            where id = playlist_id 
            and (is_public or creator_id = auth.uid())
        )
    );

create policy "Users can manage songs in own playlists"
    on public.playlist_songs for all using (
        exists(
            select 1 from public.playlists 
            where id = playlist_id 
            and creator_id = auth.uid()
        ) or
        exists(
            select 1 from public.profiles 
            where id = auth.uid() 
            and role = 'admin'
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

-- Functions for common operations
create or replace function public.get_user_role()
returns user_role
language sql
security definer
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Function to ensure user profile exists
create or replace function public.ensure_user_profile()
returns trigger
language plpgsql
security definer
as $$
begin
    insert into public.profiles (id, username, display_name, role)
    values (
        new.id,
        split_part(new.email, '@', 1),
        split_part(new.email, '@', 1),
        'user'
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

-- Trigger to create profile on user creation
create trigger on_auth_user_created
    after insert on auth.users
    for each row
    execute function public.ensure_user_profile();

-- Trigger to update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply updated_at trigger to all tables
create trigger handle_updated_at
  before update on public.profiles
  for each row
  execute function public.handle_updated_at();

-- Repeat for other tables
create trigger handle_updated_at
  before update on public.artists
  for each row
  execute function public.handle_updated_at();

-- ... (repeat for all other tables)
