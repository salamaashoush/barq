import { loadUsers, loadPosts } from "./users.data.ts";
export const path = "/users";
export async function load() { return [await loadUsers(undefined), await loadPosts(undefined)]; }
