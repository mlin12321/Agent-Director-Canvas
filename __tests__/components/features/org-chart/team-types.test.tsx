import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgentTypeInfo, SessionTeam } from "#/api/director/types";
import { isLost } from "#/components/features/org-chart/start-again";
import {
  TeamTypesContext,
  teamTypesOf,
  useMemberWords,
  useTeamTypes,
} from "#/components/features/org-chart/team-types";
import { SHIPPED_MEMBERS } from "#/mocks/director-members";
import { renderWithProviders } from "test-utils";

const LAB: AgentTypeInfo = {
  name: "lab",
  description: "A lab",
  allowed: true,
  sas_profile: null,
  members: [
    {
      name: "bench",
      title: "Bench",
      writes: true,
      reviews: false,
      oversees: false,
    },
    {
      name: "referee",
      title: "Referee",
      writes: false,
      reviews: true,
      oversees: false,
    },
    {
      name: "chair",
      title: "Chair",
      writes: false,
      reviews: false,
      oversees: true,
    },
  ],
};
const SOFTWARE: AgentTypeInfo = {
  ...LAB,
  name: "software-engineer",
  members: SHIPPED_MEMBERS,
};
const TYPES = teamTypesOf([SOFTWARE, LAB]);

function Words({ role, type }: { role: string; type?: string }) {
  const words = useMemberWords();
  const member = useTeamTypes().member(role, type);
  return (
    <ul>
      <li>{words.label(member)}</li>
      <li>{words.lead(member)}</li>
      <li>{words.answerTo(member, "API")}</li>
      <li>{words.notStarted(member)}</li>
    </ul>
  );
}

function shown(role: string, type?: string) {
  const { unmount } = renderWithProviders(
    <TeamTypesContext.Provider value={TYPES}>
      <Words role={role} type={type} />
    </TeamTypesContext.Provider>,
  );
  const said = screen.getAllByRole("listitem").map((item) => item.textContent);
  unmount();
  return said;
}

describe("the members of a team", () => {
  it("are the ones its type names, with their parts", () => {
    expect(TYPES.members("lab").map((member) => member.name)).toEqual([
      "bench",
      "referee",
      "chair",
    ]);
    expect(TYPES.member("referee", "lab").reviews).toBe(true);
    expect(TYPES.member("ic", "software-engineer").writes).toBe(true);
  });

  it("are found by name alone where the team's type is not known", () => {
    expect(TYPES.member("chair").oversees).toBe(true);
    expect(TYPES.member("ic", "a type from elsewhere").title).toBe("IC");
  });

  it("are called by their role, with no part, when no type has them", () => {
    expect(TYPES.member("auditor", "lab")).toEqual({
      name: "auditor",
      title: "auditor",
      writes: false,
      reviews: false,
      oversees: false,
    });
  });

  it("are named by the page's own words for the shipped titles", () => {
    expect(shown("ic", "software-engineer")).toEqual([
      "ORG_CHART$ROLE_IC",
      "ORG_CHART$DIVISION_LEAD_IC",
      "ORG_CHART$ESCALATION_ANSWER_TO_IC",
      "ORG_CHART$MEMBER_NOT_STARTED",
    ]);
    expect(shown("manager", "software-engineer")).toEqual([
      "ORG_CHART$ROLE_MANAGER",
      "ORG_CHART$DIVISION_LEAD_MANAGER",
      "ORG_CHART$ESCALATION_ANSWER_TO_MANAGER",
      "ORG_CHART$MANAGER_NOT_STARTED",
    ]);
  });

  it("are named by their type's title otherwise", () => {
    expect(shown("referee", "lab")).toEqual([
      "Referee",
      "ORG_CHART$DIVISION_LEAD_MEMBER",
      "ORG_CHART$ESCALATION_ANSWER_TO_MEMBER",
      "ORG_CHART$MEMBER_NOT_STARTED",
    ]);
  });
});

describe("a lost team", () => {
  const place = (role: string) =>
    ({
      status: "working",
      agents: [{ role, status: "lost" }],
    }) as unknown as SessionTeam;

  it("is one whose member that works in the folder is lost", () => {
    expect(isLost(place("bench"), TYPES.members("lab"))).toBe(true);
    expect(isLost(place("referee"), TYPES.members("lab"))).toBe(false);
    expect(isLost(place("ic"), TYPES.members("software-engineer"))).toBe(true);
  });
});
