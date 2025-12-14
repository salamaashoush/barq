/**
 * TanStack Query Demo
 * Tests: useQuery, useMutation, useInfiniteQuery, useQueryClient, useIsFetching, useIsMutating
 */

import { useState, Show, For } from "zest";
import {
  useQuery,
  useMutation,
  useInfiniteQuery,
  useQueryClient,
  useIsFetching,
  useIsMutating,
} from "zest-extra";
import { css } from "zest-extra";
import { DemoSection, DemoCard, Button } from "./shared";

interface User {
  id: number;
  name: string;
  email: string;
}

interface Post {
  id: number;
  title: string;
  body: string;
}

interface PostsPage {
  posts: Post[];
  nextPage: number | null;
}

export function QueryDemo() {
  return (
    <DemoSection>
      <BasicQueryDemo />
      <QueryWithParamsDemo />
      <MutationDemo />
      <InfiniteQueryDemo />
      <GlobalStateDemo />
    </DemoSection>
  );
}

// Basic useQuery
function BasicQueryDemo() {
  const query = useQuery(() => ({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json() as Promise<User[]>;
    },
    staleTime: 10000,
  }));

  return (
    <DemoCard title="useQuery - Basic">
      <div class={statusRowStyle}>
        <span>Status: <code>{() => query().status}</code></span>
        <span>Stale: <code>{() => String(query().isStale)}</code></span>
        <span>Fetching: <code>{() => String(query().isFetching)}</code></span>
      </div>

      <Show when={() => query().isPending}>
        <div class={loadingStyle}>Loading users...</div>
      </Show>

      <Show when={() => query().isError}>
        <div class={errorStyle}>
          Error: {() => (query().error as Error)?.message}
        </div>
      </Show>

      <Show when={() => query().isSuccess}>
        <ul class={listStyle}>
          <For each={() => query().data || []}>
            {(user) => (
              <li class={listItemStyle}>
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Button onClick={() => query().refetch()}>
        Refetch
      </Button>
    </DemoCard>
  );
}

// Query with dynamic params
function QueryWithParamsDemo() {
  const [userId, setUserId] = useState(1);

  const query = useQuery(() => ({
    queryKey: ["user", userId()],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json() as Promise<User>;
    },
  }));

  return (
    <DemoCard title="useQuery - Dynamic Params">
      <div class={buttonRowStyle}>
        <Button
          onClick={() => setUserId(1)}
          variant={userId() === 1 ? "primary" : "secondary"}
        >
          User 1
        </Button>
        <Button
          onClick={() => setUserId(2)}
          variant={userId() === 2 ? "primary" : "secondary"}
        >
          User 2
        </Button>
        <Button
          onClick={() => setUserId(3)}
          variant={userId() === 3 ? "primary" : "secondary"}
        >
          User 3
        </Button>
      </div>

      <div class={resultBoxStyle}>
        <Show when={() => query().isPending}>
          <div class={loadingStyle}>Loading user {userId}...</div>
        </Show>

        <Show when={() => query().isSuccess && query().data}>
          <div class={userCardStyle}>
            <h4>{() => query().data?.name}</h4>
            <p>{() => query().data?.email}</p>
          </div>
        </Show>
      </div>

      <p class={noteStyle}>
        Query automatically refetches when userId changes.
      </p>
    </DemoCard>
  );
}

// useMutation
function MutationDemo() {
  const queryClient = useQueryClient();
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs((l) => [...l.slice(-4), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const mutation = useMutation(() => ({
    mutationFn: async (name: string) => {
      addLog(`Mutating: ${name}`);
      // Simulate API call
      await new Promise((r) => setTimeout(r, 1000));
      return { id: Date.now(), name, email: `${name.toLowerCase()}@example.com` };
    },
    onSuccess: (data) => {
      addLog(`Success: Created ${data.name}`);
      // Invalidate users query
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: Error) => {
      addLog(`Error: ${error.message}`);
    },
  }));

  const handleCreate = () => {
    const names = ["Alice", "Bob", "Charlie", "Diana", "Eve"];
    const randomName = names[Math.floor(Math.random() * names.length)];
    mutation().mutate(randomName);
  };

  return (
    <DemoCard title="useMutation">
      <div class={statusRowStyle}>
        <span>Status: <code>{() => mutation().status}</code></span>
        <span>Pending: <code>{() => String(mutation().isPending)}</code></span>
      </div>

      <Button onClick={handleCreate} disabled={() => mutation().isPending}>
        {() => (mutation().isPending ? "Creating..." : "Create Random User")}
      </Button>

      <Show when={() => mutation().isSuccess}>
        <div class={successStyle}>
          Created: {() => (mutation().data as User)?.name}
        </div>
      </Show>

      <div class={logBoxStyle}>
        <For each={logs}>
          {(log) => <div class={logLineStyle}>{log}</div>}
        </For>
      </div>
    </DemoCard>
  );
}

// useInfiniteQuery
function InfiniteQueryDemo() {
  const query = useInfiniteQuery(() => ({
    queryKey: ["posts"],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await fetch(`/api/posts?page=${pageParam}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json() as Promise<PostsPage>;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage: PostsPage) => lastPage.nextPage,
  }));

  const allPosts = () => {
    const data = query().data;
    if (!data) return [];
    return data.pages.flatMap((page: PostsPage) => page.posts);
  };

  return (
    <DemoCard title="useInfiniteQuery - Pagination">
      <div class={statusRowStyle}>
        <span>Pages: <code>{() => query().data?.pages?.length || 0}</code></span>
        <span>Has More: <code>{() => String(query().hasNextPage)}</code></span>
      </div>

      <Show when={() => query().isPending && !query().data}>
        <div class={loadingStyle}>Loading posts...</div>
      </Show>

      <Show when={() => allPosts().length > 0}>
        <ul class={postListStyle}>
          <For each={allPosts}>
            {(post) => (
              <li class={postItemStyle}>
                <strong>#{post.id}</strong> {post.title}
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Button
        onClick={() => query().fetchNextPage()}
        disabled={() => !query().hasNextPage || query().isFetchingNextPage}
      >
        {() =>
          query().isFetchingNextPage
            ? "Loading more..."
            : query().hasNextPage
            ? "Load More"
            : "No more posts"
        }
      </Button>
    </DemoCard>
  );
}

// Global query state
function GlobalStateDemo() {
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const queryClient = useQueryClient();

  return (
    <DemoCard title="Global Query State">
      <div class={globalStatsStyle}>
        <div>
          <span>Fetching Queries</span>
          <strong>{isFetching}</strong>
        </div>
        <div>
          <span>Active Mutations</span>
          <strong>{isMutating}</strong>
        </div>
      </div>

      <Show when={() => isFetching() > 0}>
        <div class={globalLoadingStyle}>
          Global loading indicator active...
        </div>
      </Show>

      <div class={buttonRowStyle}>
        <Button
          onClick={() => queryClient.invalidateQueries({ queryKey: ["users"] })}
        >
          Invalidate Users
        </Button>
        <Button
          onClick={() => queryClient.invalidateQueries({ queryKey: ["posts"] })}
        >
          Invalidate Posts
        </Button>
        <Button onClick={() => queryClient.invalidateQueries()}>
          Invalidate All
        </Button>
      </div>

      <p class={noteStyle}>
        useIsFetching/useIsMutating track global query state.
      </p>
    </DemoCard>
  );
}

// Styles
const statusRowStyle = css`
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;

  span {
    color: #94a3b8;
  }

  code {
    color: #60a5fa;
  }
`;

const buttonRowStyle = css`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
`;

const loadingStyle = css`
  padding: 16px;
  background: #1e3a5f;
  border-radius: 8px;
  color: #60a5fa;
  margin-bottom: 12px;
`;

const errorStyle = css`
  padding: 16px;
  background: #7f1d1d;
  border-radius: 8px;
  color: #fecaca;
  margin-bottom: 12px;
`;

const successStyle = css`
  padding: 16px;
  background: #14532d;
  border-radius: 8px;
  color: #bbf7d0;
  margin: 12px 0;
`;

const listStyle = css`
  list-style: none;
  margin: 0 0 12px 0;
`;

const listItemStyle = css`
  display: flex;
  justify-content: space-between;
  padding: 10px 12px;
  background: #334155;
  border-radius: 6px;
  margin-bottom: 8px;
`;

const resultBoxStyle = css`
  margin: 16px 0;
  min-height: 80px;
`;

const userCardStyle = css`
  padding: 16px;
  background: #334155;
  border-radius: 8px;

  h4 {
    margin-bottom: 4px;
    color: #f8fafc;
  }

  p {
    color: #94a3b8;
  }
`;

const logBoxStyle = css`
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 12px;
  margin-top: 12px;
  max-height: 120px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 12px;
`;

const logLineStyle = css`
  color: #94a3b8;
  padding: 2px 0;
`;

const postListStyle = css`
  list-style: none;
  margin: 0 0 12px 0;
  max-height: 200px;
  overflow-y: auto;
`;

const postItemStyle = css`
  padding: 8px 12px;
  background: #334155;
  border-radius: 6px;
  margin-bottom: 6px;

  strong {
    color: #60a5fa;
    margin-right: 8px;
  }
`;

const globalStatsStyle = css`
  display: flex;
  gap: 32px;
  margin-bottom: 16px;

  div {
    text-align: center;

    span {
      display: block;
      color: #94a3b8;
      font-size: 12px;
      margin-bottom: 4px;
    }

    strong {
      font-size: 32px;
      color: #60a5fa;
    }
  }
`;

const globalLoadingStyle = css`
  padding: 12px;
  background: linear-gradient(90deg, #1e3a5f 0%, #334155 50%, #1e3a5f 100%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 6px;
  color: #60a5fa;
  margin-bottom: 12px;

  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
`;

const noteStyle = css`
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
  margin-top: 12px;
`;
