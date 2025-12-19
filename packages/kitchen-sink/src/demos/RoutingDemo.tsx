/**
 * Routing Demo
 * Tests: Router, params, search params, loaders, layouts, navigation
 */

import { For, Show } from "@barqjs/core";
import { clsx, css } from "@barqjs/extra";
import {
  Link,
  type LoaderContext,
  MemoryRouter,
  NavLink,
  Outlet,
  type RouteDefinition,
  route,
  useLocation,
  useNavigate,
  useSearchParams,
} from "@barqjs/extra";
import { Button, DemoCard, DemoSection } from "./shared";

// Simulated data
const users = [
  { id: "1", name: "Alice", email: "alice@example.com", role: "admin" },
  { id: "2", name: "Bob", email: "bob@example.com", role: "user" },
  { id: "3", name: "Charlie", email: "charlie@example.com", role: "user" },
];

const posts = [
  { id: "1", title: "Getting Started with Barq", author: "1", category: "tutorial" },
  { id: "2", title: "Advanced Signals", author: "2", category: "advanced" },
  { id: "3", title: "Building a Router", author: "1", category: "tutorial" },
  { id: "4", title: "SSR Deep Dive", author: "3", category: "advanced" },
];

// Simulate API delays
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ============================================================================
// Route Components
// ============================================================================

// Dashboard Layout - wraps all dashboard routes
// Uses <Outlet /> to render child routes (React Router v6 pattern)
function DashboardLayout() {
  return (
    <div class={dashboardLayoutStyle}>
      <nav class={dashboardNavStyle}>
        <NavLink href="/demo/dashboard" activeClass={activeNavStyle} exact>
          Overview
        </NavLink>
        <NavLink href="/demo/dashboard/users" activeClass={activeNavStyle}>
          Users
        </NavLink>
        <NavLink href="/demo/dashboard/posts" activeClass={activeNavStyle}>
          Posts
        </NavLink>
        <NavLink href="/demo/dashboard/settings" activeClass={activeNavStyle}>
          Settings
        </NavLink>
      </nav>
      <div class={dashboardContentStyle}>
        <Outlet />
      </div>
    </div>
  );
}

// Dashboard Overview
function DashboardOverview() {
  return (
    <div>
      <h3 class={pageTitle}>Dashboard Overview</h3>
      <div class={statsGridStyle}>
        <div class={statCardStyle}>
          <div class={statValueStyle}>{users.length}</div>
          <div class={statLabelStyle}>Total Users</div>
        </div>
        <div class={statCardStyle}>
          <div class={statValueStyle}>{posts.length}</div>
          <div class={statLabelStyle}>Total Posts</div>
        </div>
      </div>
    </div>
  );
}

// Users List with loader
interface UsersData {
  users: typeof users;
  total: number;
}

function UsersList(props: { data: UsersData }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const currentFilter = () => searchParams().get("role") || "all";

  const filteredUsers = () => {
    const filter = currentFilter();
    if (filter === "all") return props.data.users;
    return props.data.users.filter((u) => u.role === filter);
  };

  return (
    <div>
      <h3 class={pageTitle}>Users</h3>

      <div class={filterBarStyle}>
        <span>Filter by role:</span>
        <select
          value={currentFilter()}
          onChange={(e: Event) => {
            const value = (e.target as HTMLSelectElement).value;
            setSearchParams({ role: value === "all" ? "" : value });
          }}
          class={selectStyle}
        >
          <option value="all">All</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
        </select>
      </div>

      <ul class={listStyle}>
        <For each={filteredUsers}>
          {(user) => (
            <li class={listItemStyle}>
              <Link href={`/demo/dashboard/users/${user.id}`}>
                <strong>{user.name}</strong>
                <span class={tagStyle}>{user.role}</span>
              </Link>
            </li>
          )}
        </For>
      </ul>

      <p class={noteStyle}>Search params: role={currentFilter()}</p>
    </div>
  );
}

// User Detail with params
interface UserDetailData {
  user: (typeof users)[0] | undefined;
  posts: typeof posts;
}

function UserDetail(props: { data: UserDetailData }) {
  const { user, posts: userPosts } = props.data;

  if (!user) {
    return <div class={errorStyle}>User not found</div>;
  }

  return (
    <div>
      <div class={breadcrumbStyle}>
        <Link href="/demo/dashboard/users">Users</Link>
        <span>/</span>
        <span>{user.name}</span>
      </div>

      <h3 class={pageTitle}>{user.name}</h3>

      <div class={detailCardStyle}>
        <p>
          <strong>Email:</strong> {user.email}
        </p>
        <p>
          <strong>Role:</strong> <span class={tagStyle}>{user.role}</span>
        </p>
        <p>
          <strong>ID:</strong> {user.id}
        </p>
      </div>

      <h4 class={subTitleStyle}>Posts by {user.name}</h4>
      <Show when={() => userPosts.length > 0} fallback={<p class={emptyStyle}>No posts yet</p>}>
        <ul class={listStyle}>
          <For each={() => userPosts}>
            {(post) => (
              <li class={listItemStyle}>
                <Link href={`/demo/dashboard/posts/${post.id}`}>{post.title}</Link>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}

// Posts List with search params for filtering and pagination
interface PostsData {
  posts: typeof posts;
  total: number;
}

function PostsList(props: { data: PostsData }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const currentCategory = () => searchParams().get("category") || "all";
  const currentPage = () => Number.parseInt(searchParams().get("page") || "1", 10);

  const filteredPosts = () => {
    const cat = currentCategory();
    if (cat === "all") return props.data.posts;
    return props.data.posts.filter((p) => p.category === cat);
  };

  const setCategory = (category: string) => {
    const params: Record<string, string> = { page: "1" };
    if (category !== "all") params.category = category;
    setSearchParams(params);
  };

  return (
    <div>
      <h3 class={pageTitle}>Posts</h3>

      <div class={filterBarStyle}>
        <button
          class={clsx(filterBtnStyle, currentCategory() === "all" && filterBtnActiveStyle)}
          onClick={() => setCategory("all")}
        >
          All
        </button>
        <button
          class={clsx(filterBtnStyle, currentCategory() === "tutorial" && filterBtnActiveStyle)}
          onClick={() => setCategory("tutorial")}
        >
          Tutorials
        </button>
        <button
          class={clsx(filterBtnStyle, currentCategory() === "advanced" && filterBtnActiveStyle)}
          onClick={() => setCategory("advanced")}
        >
          Advanced
        </button>
      </div>

      <ul class={listStyle}>
        <For each={filteredPosts}>
          {(post) => (
            <li class={listItemStyle}>
              <Link href={`/demo/dashboard/posts/${post.id}`}>
                <strong>{post.title}</strong>
                <span class={categoryTagStyle}>{post.category}</span>
              </Link>
            </li>
          )}
        </For>
      </ul>

      <div class={paginationStyle}>
        <Button
          disabled={() => currentPage() <= 1}
          onClick={() =>
            setSearchParams((p) => ({ ...Object.fromEntries(p), page: String(currentPage() - 1) }))
          }
        >
          Previous
        </Button>
        <span>Page {currentPage}</span>
        <Button
          onClick={() =>
            setSearchParams((p) => ({ ...Object.fromEntries(p), page: String(currentPage() + 1) }))
          }
        >
          Next
        </Button>
      </div>

      <p class={noteStyle}>
        Query: category={currentCategory()}, page={currentPage}
      </p>
    </div>
  );
}

// Post Detail
interface PostDetailData {
  post: (typeof posts)[0] | undefined;
  author: (typeof users)[0] | undefined;
}

function PostDetail(props: { data: PostDetailData }) {
  const { post, author } = props.data;
  const nav = useNavigate();

  if (!post) {
    return <div class={errorStyle}>Post not found</div>;
  }

  return (
    <div>
      <div class={breadcrumbStyle}>
        <Link href="/demo/dashboard/posts">Posts</Link>
        <span>/</span>
        <span>{post.title}</span>
      </div>

      <h3 class={pageTitle}>{post.title}</h3>

      <div class={detailCardStyle}>
        <p>
          <strong>Category:</strong> <span class={categoryTagStyle}>{post.category}</span>
        </p>
        <p>
          <strong>Author:</strong>{" "}
          <Show when={() => author} fallback={<span>Unknown</span>}>
            {(auth) => <Link href={`/demo/dashboard/users/${auth.id}`}>{auth.name}</Link>}
          </Show>
        </p>
        <p>
          <strong>ID:</strong> {post.id}
        </p>
      </div>

      <div class={buttonRowStyle}>
        <Button onClick={() => nav("/demo/dashboard/posts")}>Back to Posts</Button>
        <Show when={() => author}>
          {(auth) => (
            <Button variant="secondary" onClick={() => nav(`/demo/dashboard/users/${auth.id}`)}>
              View Author
            </Button>
          )}
        </Show>
      </div>
    </div>
  );
}

// Settings with nested tabs
function Settings() {
  const location = useLocation();

  return (
    <div>
      <h3 class={pageTitle}>Settings</h3>

      <div class={tabsStyle}>
        <NavLink href="/demo/dashboard/settings" activeClass={tabActiveStyle} exact>
          General
        </NavLink>
        <NavLink href="/demo/dashboard/settings/security" activeClass={tabActiveStyle}>
          Security
        </NavLink>
        <NavLink href="/demo/dashboard/settings/notifications" activeClass={tabActiveStyle}>
          Notifications
        </NavLink>
      </div>

      <div class={settingsContentStyle}>
        <p>Current path: {() => location().pathname}</p>
        <p class={noteStyle}>
          This demonstrates nested route matching. Each settings tab could be its own route.
        </p>
      </div>
    </div>
  );
}

// 404 Fallback
function NotFound() {
  const location = useLocation();

  return (
    <div class={notFoundStyle}>
      <h2>404 - Page Not Found</h2>
      <p>The path "{() => location().pathname}" does not exist.</p>
      <Link href="/demo/dashboard">Go to Dashboard</Link>
    </div>
  );
}

// ============================================================================
// Route Loaders
// ============================================================================

async function usersLoader() {
  await delay(300); // Simulate network
  return { users, total: users.length };
}

async function userDetailLoader(ctx: LoaderContext) {
  await delay(200);
  const user = users.find((u) => u.id === ctx.params.id);
  const userPosts = posts.filter((p) => p.author === ctx.params.id);
  return { user, posts: userPosts };
}

async function postsLoader() {
  await delay(300);
  return { posts, total: posts.length };
}

async function postDetailLoader(ctx: LoaderContext) {
  await delay(200);
  const post = posts.find((p) => p.id === ctx.params.id);
  const author = post ? users.find((u) => u.id === post.author) : undefined;
  return { post, author };
}

// ============================================================================
// Route Definitions - using route() helper for type safety
// ============================================================================

const routes: RouteDefinition[] = [
  route({
    path: "/demo/dashboard",
    component: DashboardLayout,
    children: [
      route({
        path: "/",
        component: DashboardOverview,
      }),
      route({
        path: "/users",
        component: UsersList,
        loader: usersLoader,
      }),
      route({
        path: "/users/:id",
        component: UserDetail,
        loader: userDetailLoader,
      }),
      route({
        path: "/posts",
        component: PostsList,
        loader: postsLoader,
      }),
      route({
        path: "/posts/:id",
        component: PostDetail,
        loader: postDetailLoader,
      }),
      route({
        path: "/settings",
        component: Settings,
      }),
      route({
        path: "/settings/security",
        component: Settings,
      }),
      route({
        path: "/settings/notifications",
        component: Settings,
      }),
    ] as RouteDefinition[],
  }),
];

// ============================================================================
// Main Demo Component
// ============================================================================

export function RoutingDemo() {
  return (
    <DemoSection>
      <DemoCard title="Router Demo">
        <p class={introStyle}>
          Explore the dashboard below. Try navigating between sections, filtering users by role,
          filtering posts by category, and viewing individual items.
        </p>

        <div class={routerContainerStyle}>
          <MemoryRouter
            initialPath="/demo/dashboard"
            config={{
              routes,
              fallback: NotFound,
            }}
          />
        </div>
      </DemoCard>
    </DemoSection>
  );
}

// ============================================================================
// Styles
// ============================================================================

const introStyle = css`
  color: #94a3b8;
  margin-bottom: 16px;
`;

const routerContainerStyle = css`
  border: 1px solid #334155;
  border-radius: 8px;
  min-height: 400px;
  overflow: hidden;
`;

const dashboardLayoutStyle = css`
  display: flex;
  min-height: 400px;
`;

const dashboardNavStyle = css`
  width: 160px;
  background: #0f172a;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;

  a {
    padding: 8px 12px;
    border-radius: 6px;
    color: #94a3b8;
    text-decoration: none;
    font-size: 14px;

    &:hover {
      background: #1e293b;
      color: #e2e8f0;
    }
  }
`;

const activeNavStyle = css`
  background: #3b82f6 !important;
  color: white !important;
`;

const dashboardContentStyle = css`
  flex: 1;
  padding: 20px;
  background: #1e293b;
`;

const pageTitle = css`
  font-size: 20px;
  font-weight: 600;
  color: #f8fafc;
  margin-bottom: 16px;
`;

const subTitleStyle = css`
  font-size: 16px;
  font-weight: 500;
  color: #e2e8f0;
  margin: 20px 0 12px;
`;

const statsGridStyle = css`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
`;

const statCardStyle = css`
  background: #334155;
  padding: 20px;
  border-radius: 8px;
  text-align: center;
`;

const statValueStyle = css`
  font-size: 32px;
  font-weight: bold;
  color: #60a5fa;
`;

const statLabelStyle = css`
  font-size: 14px;
  color: #94a3b8;
  margin-top: 4px;
`;

const filterBarStyle = css`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  color: #94a3b8;
`;

const selectStyle = css`
  padding: 6px 12px;
  border: 1px solid #475569;
  border-radius: 6px;
  background: #334155;
  color: #e2e8f0;
  font-size: 14px;
`;

const filterBtnStyle = css`
  padding: 6px 12px;
  border: 1px solid #475569;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background: #334155;
    color: #e2e8f0;
  }
`;

const filterBtnActiveStyle = css`
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;

  &:hover {
    background: #2563eb;
  }
`;

const listStyle = css`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const listItemStyle = css`
  padding: 12px;
  background: #334155;
  border-radius: 6px;
  margin-bottom: 8px;

  a {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #e2e8f0;
    text-decoration: none;

    &:hover {
      color: #60a5fa;
    }
  }
`;

const tagStyle = css`
  padding: 2px 8px;
  background: #475569;
  border-radius: 4px;
  font-size: 12px;
  color: #94a3b8;
`;

const categoryTagStyle = css`
  padding: 2px 8px;
  background: #1e3a5f;
  border-radius: 4px;
  font-size: 12px;
  color: #60a5fa;
`;

const breadcrumbStyle = css`
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 16px;
  font-size: 14px;
  color: #64748b;

  a {
    color: #60a5fa;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
`;

const detailCardStyle = css`
  background: #334155;
  padding: 16px;
  border-radius: 8px;

  p {
    margin: 8px 0;
    color: #e2e8f0;
  }
`;

const paginationStyle = css`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  color: #94a3b8;
`;

const tabsStyle = css`
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid #334155;
  padding-bottom: 8px;

  a {
    padding: 8px 16px;
    border-radius: 6px 6px 0 0;
    color: #94a3b8;
    text-decoration: none;
    font-size: 14px;

    &:hover {
      background: #334155;
      color: #e2e8f0;
    }
  }
`;

const tabActiveStyle = css`
  background: #334155 !important;
  color: #60a5fa !important;
`;

const settingsContentStyle = css`
  padding: 16px;
  background: #334155;
  border-radius: 8px;
  color: #e2e8f0;
`;

const notFoundStyle = css`
  text-align: center;
  padding: 40px 20px;
  color: #94a3b8;

  h2 {
    color: #ef4444;
    margin-bottom: 12px;
  }

  a {
    color: #60a5fa;
    margin-top: 16px;
    display: inline-block;
  }
`;

const errorStyle = css`
  padding: 20px;
  background: #7f1d1d;
  border-radius: 8px;
  color: #fecaca;
  text-align: center;
`;

const emptyStyle = css`
  color: #64748b;
  font-style: italic;
`;

const buttonRowStyle = css`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
`;

const noteStyle = css`
  font-size: 12px;
  color: #64748b;
  font-style: italic;
  margin-top: 12px;
`;
