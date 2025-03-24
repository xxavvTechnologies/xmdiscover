-- Create function to calculate chart rankings
create or replace function calculate_top_100_chart()
returns void
language plpgsql
as $$
declare
    chart_id uuid;
begin
    -- Get or create the Top 100 chart
    select id into chart_id from charts where name = 'Top 100' limit 1;
    
    if chart_id is null then
        insert into charts (name, description, type, status)
        values ('Top 100', 'Weekly Top 100 Songs', 'weekly', 'published')
        returning id into chart_id;
    end if;

    -- Archive old entries by explicitly referencing the chart_id parameter
    update chart_entries 
    set archived = true 
    where chart_entries.chart_id = calculate_top_100_chart.chart_id;

    -- Calculate new rankings based on play count for the last 7 days
    insert into chart_entries (chart_id, song_id, position, previous_position, streams)
    select 
        chart_id,
        s.id as song_id,
        row_number() over (order by count(*) desc) as position,
        coalesce((
            select position 
            from chart_entries ce 
            where ce.song_id = s.id 
            and ce.chart_id = chart_id
            and ce.archived = false
            limit 1
        ), null) as previous_position,
        count(*) as streams
    from songs s
    join play_history ph on ph.song_id = s.id
    where ph.played_at > now() - interval '7 days'
    group by s.id
    having count(*) > 0
    order by streams desc
    limit 100;

    -- Update chart metadata
    update charts 
    set updated_at = now(),
        start_date = date_trunc('week', now()),
        end_date = date_trunc('week', now()) + interval '7 days'
    where id = chart_id;
end;
$$;

-- Update Top 100 chart with cover image
update charts
set cover_url = 'https://juywatmqwykgdjfqexho.supabase.co/storage/v1/object/public/images/system/chart%20100%20(xMD).png'
where name = 'Top 100';

-- Create scheduled task trigger function
create or replace function schedule_chart_update()
returns trigger
language plpgsql
as $$
begin
    -- Schedule chart update for next Sunday at midnight UTC
    perform
        pg_catalog.pg_schedule_background_task(
            'select calculate_top_100_chart()',
            next_sunday()
        );
    return new;
end;
$$;

-- Helper function to get next Sunday
create or replace function next_sunday()
returns timestamptz
language sql
as $$
    select date_trunc('week', now() at time zone 'UTC') + interval '1 week';
$$;

-- Create trigger for automatic weekly updates
create trigger schedule_next_chart_update
after insert or update
on chart_entries
for each statement
execute function schedule_chart_update();

-- Add archived column to chart_entries
alter table chart_entries 
add column if not exists archived boolean default false;