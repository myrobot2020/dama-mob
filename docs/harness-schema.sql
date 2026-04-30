-- DAMA Global Harness Schema Extensions

-- 1. Enable pgvector for semantic search (Point 21 & 4)
create extension if not exists vector;

-- 2. Harness Traces Table (Point 9 & 30)
-- Stores the execution logs of AI Harness runs for global monitoring and model adaptation.
create table if not exists public.harness_traces (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  intent_kind text not null,
  intent_confidence float,
  input_text text,
  metadata jsonb default '{}'::jsonb,
  steps jsonb default '[]'::jsonb,
  trace jsonb default '[]'::jsonb,
  outputs jsonb default '{}'::jsonb,
  feedback jsonb default null,
  duration_ms integer,
  created_at timestamp with time zone default now()
);

-- Enable RLS on traces (Users can only see their own traces, admins can see all)
alter table public.harness_traces enable row level security;
create policy "Users can insert their own traces" on public.harness_traces for insert with check (auth.uid() = user_id);
create policy "Users can view their own traces" on public.harness_traces for select using (auth.uid() = user_id);

-- 3. Sutta Embeddings Table (Point 21 & 4)
-- Stores semantic vectors for suttas to enable high-fidelity retrieval across the canon.
create table if not exists public.sutta_embeddings (
  id uuid primary key default gen_random_uuid(),
  sutta_id text not null,
  nikaya text not null,
  content text not null,
  embedding vector(1536), -- Designed for OpenAI text-embedding-3-small
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

-- Index for vector similarity search
create index if not exists sutta_embeddings_vector_idx on public.sutta_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- 4. RPC for Vector Search
create or replace function match_suttas(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  sutta_id text,
  nikaya text,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    sutta_embeddings.id,
    sutta_embeddings.sutta_id,
    sutta_embeddings.nikaya,
    sutta_embeddings.content,
    sutta_embeddings.metadata,
    1 - (sutta_embeddings.embedding <=> query_embedding) as similarity
  from sutta_embeddings
  where 1 - (sutta_embeddings.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
end;
$$;
