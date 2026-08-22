/**
 * Routing Demo
 * Tests: Router, params, search params, loaders, layouts, navigation, guards
 *
 * Note: View transitions and scroll restoration work with the main app Router.
 * This demo drives a `memoryHistory`, so its navigation is isolated from the page.
 */

import { For, Show, signal } from "@barqjs/core";
import { clsx, css } from "../styles";
import type { Cell } from "@barqjs/core";
import {
  type Guard,
  Link,
  NavLink,
  type RouteDefinition,
  type RouteProps,
  Router,
  memoryHistory,
  route,
  useLocation,
  useNavigate,
  useSearchParams,
} from "@barqjs/router";
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

// Simulated auth state
let isAuthenticated = true;
let userRole = "admin";

// ============================================================================
// Route Guards
// ============================================================================

// Auth guard - redirects to login if not authenticated
const authGuard: Guard = async () => {
  if (!isAuthenticated) {
    return "/demo/dashboard/login";
  }
  return true;
};

// Admin guard - only allows admin users
const adminGuard: Guard = async () => {
  if (userRole !== "admin") {
    return "/demo/dashboard";
  }
  return true;
};

// ============================================================================
// Route Components
// ============================================================================
//
// Every one is EXPORTED. C2: a component is declared, never inferred, and a
// function handed to the router through a route table is called with a scope by
// another module — nothing module-local proves that, so exporting it is the
// evidence C2 accepts.
//
// Props are Cells and are CALLED at the use site, and `props.children` is the
// next matched route as a Block taking a scope. `<Outlet />` is gone: a layout
// renders its child by placing `props.children`.

// Dashboard Layout - wraps all dashboard routes
export function DashboardLayout(props: RouteProps) {
  const authState = signal(true);
  const roleState = signal("admin");

  // Sync local state with module-level state
  const toggleAuth = () => {
    isAuthenticated = !isAuthenticated;
    authState.set(isAuthenticated);
  };

  const toggleRole = () => {
    userRole = userRole === "admin" ? "user" : "admin";
    roleState.set(userRole);
  };

  return (
    <div class={dashboardLayoutStyle}>
      <nav class={dashboardNavStyle}>
        <NavLink to="/demo/dashboard" activeClass={activeNavStyle} end>
          Overview
        </NavLink>
        <NavLink to="/demo/dashboard/users" activeClass={activeNavStyle}>
          Users
        </NavLink>
        <NavLink to="/demo/dashboard/posts" activeClass={activeNavStyle}>
          Posts
        </NavLink>
        <NavLink to="/demo/dashboard/admin" activeClass={activeNavStyle}>
          Admin
        </NavLink>

        <div class={authControlsStyle}>
          <div class={authStatusStyle}>
            Auth:{" "}
            <span class={() => (authState() ? greenText : redText)}>
              {() => (authState() ? "Yes" : "No")}
            </span>
          </div>
          <div class={authStatusStyle}>
            Role: <span class={blueText}>{roleState}</span>
          </div>
          <button class={smallBtnStyle} onClick={toggleAuth}>
            Toggle Auth
          </button>
          <button class={smallBtnStyle} onClick={toggleRole}>
            Toggle Role
          </button>
        </div>
      </nav>
      <div class={dashboardContentStyle}>{props.children}</div>
    </div>
  );
}

// Login page (shown when auth guard fails)
export function LoginPage() {
  const nav = useNavigate();

  const handleLogin = () => {
    isAuthenticated = true;
    nav("/demo/dashboard");
  };

  return (
    <div class={loginPageStyle}>
      <h3 class={pageTitle}>Login Required</h3>
      <p class={noteStyle}>You were redirected here by the auth guard.</p>
      <Button onClick={handleLogin}>Simulate Login</Button>
    </div>
  );
}

// Dashboard Overview
export function DashboardOverview() {
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
      <p class={noteStyle}>
        Try toggling auth/role in the sidebar, then navigate to see guards in action.
      </p>
    </div>
  );
}

// Users List with loader
interface UsersData {
  users: typeof users;
  total: number;
}

export function UsersList(props: RouteProps<UsersData | undefined>) {
  const [searchParams, setSearchParams] = useSearchParams();

  const currentFilter = () => searchParams().get("role") || "all";

  const filteredUsers = () => {
    const filter = currentFilter();
    const all = props.data()?.users ?? [];
    if (filter === "all") return all;
    return all.filter((u) => u.role === filter);
  };

  return (
    <div>
      <h3 class={pageTitle}>Users</h3>

      <div class={filterBarStyle}>
        <span>Filter:</span>
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
          {(user: (typeof users)[number]) => (
            <li class={listItemStyle}>
              <Link to={`/demo/dashboard/users/${user.id}`}>
                <strong>{user.name}</strong>
                <span class={tagStyle}>{user.role}</span>
              </Link>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}

// User Detail with params
interface UserDetailData {
  user: (typeof users)[0] | undefined;
  posts: typeof posts;
}

export function UserDetail(props: RouteProps<UserDetailData | undefined>) {
  // Destructuring at the top would snapshot the loader's answer; the reads stay
  // where they are used, which is what keeps the route alive across a parameter
  // change instead of remounting it.
  const user = () => props.data()?.user;
  const userPosts = () => props.data()?.posts ?? [];

  return (
    <Show when={user} fallback={<div class={errorStyle}>User not found</div>}>
      {(found: () => (typeof users)[number]) => (
        <div>
          <div class={breadcrumbStyle}>
            <Link to="/demo/dashboard/users">Users</Link>
            <span>/</span>
            <span>{found().name}</span>
          </div>

          <h3 class={pageTitle}>{found().name}</h3>

          <div class={detailCardStyle}>
            <p>
              <strong>Email:</strong> {found().email}
            </p>
            <p>
              <strong>Role:</strong> <span class={tagStyle}>{found().role}</span>
            </p>
          </div>

          <h4 class={subTitleStyle}>Posts by {found().name}</h4>
          <Show
            when={() => userPosts().length > 0}
            fallback={<p class={emptyStyle}>No posts yet</p>}
          >
            <ul class={listStyle}>
              <For each={userPosts}>
                {(post: (typeof posts)[number]) => (
                  <li class={listItemStyle}>
                    <Link to={`/demo/dashboard/posts/${post.id}`}>{post.title}</Link>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      )}
    </Show>
  );
}

// Posts List
interface PostsData {
  posts: typeof posts;
}

export function PostsList(props: RouteProps<PostsData | undefined>) {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentCategory = () => searchParams().get("category") || "all";

  const filteredPosts = () => {
    const cat = currentCategory();
    const all = props.data()?.posts ?? [];
    if (cat === "all") return all;
    return all.filter((p) => p.category === cat);
  };

  return (
    <div>
      <h3 class={pageTitle}>Posts</h3>

      <div class={filterBarStyle}>
        <button
          class={clsx(filterBtnStyle, currentCategory() === "all" && filterBtnActiveStyle)}
          onClick={() => setSearchParams({})}
        >
          All
        </button>
        <button
          class={clsx(filterBtnStyle, currentCategory() === "tutorial" && filterBtnActiveStyle)}
          onClick={() => setSearchParams({ category: "tutorial" })}
        >
          Tutorials
        </button>
        <button
          class={clsx(filterBtnStyle, currentCategory() === "advanced" && filterBtnActiveStyle)}
          onClick={() => setSearchParams({ category: "advanced" })}
        >
          Advanced
        </button>
      </div>

      <ul class={listStyle}>
        <For each={filteredPosts}>
          {(post: (typeof posts)[number]) => (
            <li class={listItemStyle}>
              <Link to={`/demo/dashboard/posts/${post.id}`}>
                <strong>{post.title}</strong>
                <span class={categoryTagStyle}>{post.category}</span>
              </Link>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}

// Post Detail
interface PostDetailData {
  post: (typeof posts)[0] | undefined;
  author: (typeof users)[0] | undefined;
}

export function PostDetail(props: RouteProps<PostDetailData | undefined>) {
  const nav = useNavigate();
  const post = () => props.data()?.post;
  const author = () => props.data()?.author;

  return (
    <Show when={post} fallback={<div class={errorStyle}>Post not found</div>}>
      {(found: () => (typeof posts)[number]) => (
        <div>
          <div class={breadcrumbStyle}>
            <Link to="/demo/dashboard/posts">Posts</Link>
            <span>/</span>
            <span>{found().title}</span>
          </div>

          <h3 class={pageTitle}>{found().title}</h3>

          <div class={detailCardStyle}>
            <p>
              <strong>Category:</strong> <span class={categoryTagStyle}>{found().category}</span>
            </p>
            <p>
              <strong>Author:</strong>{" "}
              <Show when={author} fallback={<span>Unknown</span>}>
                {(auth: () => (typeof users)[number]) => (
                  <Link to={`/demo/dashboard/users/${auth().id}`}>{auth().name}</Link>
                )}
              </Show>
            </p>
          </div>

          <Button onClick={() => nav("/demo/dashboard/posts")}>Back to Posts</Button>
        </div>
      )}
    </Show>
  );
}

// Admin Only Page (protected by admin guard)
export function AdminPage() {
  return (
    <div>
      <h3 class={pageTitle}>Admin Panel</h3>
      <div class={adminPanelStyle}>
        <p>This page is protected by an admin guard.</p>
        <p>Only users with "admin" role can access this page.</p>
        <p class={noteStyle}>
          Toggle role to "user" in sidebar, navigate away, then try to come back.
        </p>
      </div>
    </div>
  );
}

// 404 Fallback
export function NotFound() {
  const location = useLocation();

  return (
    <div class={notFoundStyle}>
      <h2>404 - Page Not Found</h2>
      <p>The path "{() => location().pathname}" does not exist.</p>
      <Link to="/demo/dashboard">Go to Dashboard</Link>
    </div>
  );
}

// ============================================================================
// Route Loaders
// ============================================================================

async function usersLoader() {
  await delay(200);
  return { users, total: users.length };
}

async function userDetailLoader(ctx: { params: Record<string, string>; search: URLSearchParams }) {
  await delay(100);
  const user = users.find((u) => u.id === ctx.params.id);
  const userPosts = posts.filter((p) => p.author === ctx.params.id);
  return { user, posts: userPosts };
}

async function postsLoader() {
  await delay(200);
  return { posts, total: posts.length };
}

async function postDetailLoader(ctx: { params: Record<string, string>; search: URLSearchParams }) {
  await delay(100);
  const post = posts.find((p) => p.id === ctx.params.id);
  const author = post ? users.find((u) => u.id === post.author) : undefined;
  return { post, author };
}

// ============================================================================
// Route Definitions
// ============================================================================

const routes: RouteDefinition[] = [
  route({
    path: "/demo/dashboard/login",
    component: LoginPage,
  }),
  route({
    path: "/demo/dashboard",
    component: DashboardLayout,
    beforeEnter: authGuard,
    children: [
      route({ path: "/", component: DashboardOverview }),
      route({ path: "/users", component: UsersList, loader: usersLoader }),
      route({ path: "/users/$id", component: UserDetail, loader: userDetailLoader }),
      route({ path: "/posts", component: PostsList, loader: postsLoader }),
      route({ path: "/posts/$id", component: PostDetail, loader: postDetailLoader }),
      route({ path: "/admin", component: AdminPage, beforeEnter: adminGuard }),
    ] as RouteDefinition[],
  }),
];

// ============================================================================
// Main Demo Component
// ============================================================================

export function RoutingDemo() {
  return (
    <DemoSection>
      <DemoCard title="Router Features">
        <p class={introStyle}>
          The main app uses the Router with view transitions, scroll restoration, and navigation
          guards. Navigate between sections in the sidebar to see these features in action.
        </p>

        <div class={featureListStyle}>
          <div class={featureItemStyle}>
            <span class={featureIconStyle}>✨</span>
            <div>
              <strong>View Transitions</strong>
              <p>Navigate between sidebar items to see smooth fade transitions (Chrome/Edge).</p>
            </div>
          </div>
          <div class={featureItemStyle}>
            <span class={featureIconStyle}>📜</span>
            <div>
              <strong>Scroll Restoration</strong>
              <p>Scroll position is saved and restored when navigating back.</p>
            </div>
          </div>
          <div class={featureItemStyle}>
            <span class={featureIconStyle}>🛡️</span>
            <div>
              <strong>Route Guards</strong>
              <p>Guards can redirect or block navigation. Demo below shows auth/admin guards.</p>
            </div>
          </div>
          <div class={featureItemStyle}>
            <span class={featureIconStyle}>📦</span>
            <div>
              <strong>Loaders & Caching</strong>
              <p>Route loaders fetch data with automatic caching and cancellation.</p>
            </div>
          </div>
        </div>
      </DemoCard>

      <DemoCard title="Nested Routes Demo (memory history)">
        <p class={introStyle}>
          This isolated demo shows nested routes, params, search params, loaders, and guards. Use
          the auth/role toggles to test guard behavior.
        </p>

        <div class={routerContainerStyle}>
          <Router
            history={memoryHistory({ initial: ["/demo/dashboard"] })}
            routes={routes}
            notFound={NotFound}
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

const featureListStyle = css`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
`;

const featureItemStyle = css`
  display: flex;
  gap: 12px;
  padding: 12px;
  background: #1e293b;
  border-radius: 8px;

  strong {
    color: #e2e8f0;
    display: block;
    margin-bottom: 4px;
  }

  p {
    color: #64748b;
    font-size: 12px;
    margin: 0;
  }
`;

const featureIconStyle = css`
  font-size: 24px;
`;

const routerContainerStyle = css`
  border: 1px solid #334155;
  border-radius: 8px;
  min-height: 350px;
  overflow: hidden;
`;

const dashboardLayoutStyle = css`
  display: flex;
  min-height: 350px;
`;

const dashboardNavStyle = css`
  width: 140px;
  background: #0f172a;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;

  a {
    padding: 8px 10px;
    border-radius: 6px;
    color: #94a3b8;
    text-decoration: none;
    font-size: 13px;

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

const authControlsStyle = css`
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid #334155;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const authStatusStyle = css`
  font-size: 11px;
  color: #64748b;
`;

const greenText = css`
  color: #22c55e;
`;

const redText = css`
  color: #ef4444;
`;

const blueText = css`
  color: #60a5fa;
`;

const smallBtnStyle = css`
  padding: 4px 6px;
  font-size: 10px;
  background: #334155;
  border: none;
  border-radius: 4px;
  color: #94a3b8;
  cursor: pointer;

  &:hover {
    background: #475569;
    color: #e2e8f0;
  }
`;

const dashboardContentStyle = css`
  flex: 1;
  padding: 16px;
  background: #1e293b;
`;

const pageTitle = css`
  font-size: 18px;
  font-weight: 600;
  color: #f8fafc;
  margin-bottom: 12px;
`;

const subTitleStyle = css`
  font-size: 14px;
  font-weight: 500;
  color: #e2e8f0;
  margin: 16px 0 8px;
`;

const statsGridStyle = css`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
`;

const statCardStyle = css`
  background: #334155;
  padding: 16px;
  border-radius: 8px;
  text-align: center;
`;

const statValueStyle = css`
  font-size: 28px;
  font-weight: bold;
  color: #60a5fa;
`;

const statLabelStyle = css`
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
`;

const filterBarStyle = css`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: #94a3b8;
  font-size: 13px;
`;

const selectStyle = css`
  padding: 4px 8px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #334155;
  color: #e2e8f0;
  font-size: 12px;
`;

const filterBtnStyle = css`
  padding: 4px 10px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: transparent;
  color: #94a3b8;
  font-size: 12px;
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
`;

const listStyle = css`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const listItemStyle = css`
  padding: 10px;
  background: #334155;
  border-radius: 6px;
  margin-bottom: 6px;

  a {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #e2e8f0;
    text-decoration: none;
    font-size: 13px;

    &:hover {
      color: #60a5fa;
    }
  }
`;

const tagStyle = css`
  padding: 2px 6px;
  background: #475569;
  border-radius: 4px;
  font-size: 11px;
  color: #94a3b8;
`;

const categoryTagStyle = css`
  padding: 2px 6px;
  background: #1e3a5f;
  border-radius: 4px;
  font-size: 11px;
  color: #60a5fa;
`;

const breadcrumbStyle = css`
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 12px;
  font-size: 12px;
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
  padding: 12px;
  border-radius: 8px;
  font-size: 13px;

  p {
    margin: 6px 0;
    color: #e2e8f0;
  }
`;

const adminPanelStyle = css`
  padding: 16px;
  background: linear-gradient(135deg, #1e3a5f 0%, #312e81 100%);
  border-radius: 8px;
  color: #e2e8f0;
  font-size: 13px;

  p {
    margin: 6px 0;
  }
`;

const loginPageStyle = css`
  text-align: center;
  padding: 30px 16px;
`;

const notFoundStyle = css`
  text-align: center;
  padding: 30px 16px;
  color: #94a3b8;

  h2 {
    color: #ef4444;
    margin-bottom: 8px;
    font-size: 18px;
  }

  a {
    color: #60a5fa;
    margin-top: 12px;
    display: inline-block;
  }
`;

const errorStyle = css`
  padding: 16px;
  background: #7f1d1d;
  border-radius: 8px;
  color: #fecaca;
  text-align: center;
  font-size: 13px;
`;

const emptyStyle = css`
  color: #64748b;
  font-style: italic;
  font-size: 13px;
`;

const noteStyle = css`
  font-size: 11px;
  color: #64748b;
  font-style: italic;
  margin-top: 8px;
`;
