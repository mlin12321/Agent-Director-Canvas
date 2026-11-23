import type { MemberInfo } from "#/api/director/types";

/** The members of a team of a shipped type, as the server lists them. */
export const SHIPPED_MEMBERS: MemberInfo[] = [
  { name: "ic", title: "IC", writes: true, reviews: true, oversees: false },
  {
    name: "manager",
    title: "Manager",
    writes: false,
    reviews: false,
    oversees: true,
  },
];
