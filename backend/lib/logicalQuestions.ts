/** Minimal shape needed to group question rows into logical questions. */
export interface GroupableRow {
  id: string;
  question_group_id: string | null;
  part_index: number | null;
}

export interface LogicalUnit<T extends GroupableRow> {
  /** Representative row: the lowest-part_index member of a group, or the row itself when standalone. */
  lead: T;
  /** All member ids in part order (a single id for a standalone). */
  memberIds: string[];
}

/**
 * Collapse a flat list of question rows into logical questions. Standalone rows
 * pass through as one unit each; rows sharing a `question_group_id` fold into ONE
 * unit whose `lead` is the lowest-`part_index` member. Output preserves the
 * first-seen order of each logical unit; a group's `memberIds` are ordered by
 * `part_index`.
 */
export function groupIntoLogical<T extends GroupableRow>(rows: T[]): LogicalUnit<T>[] {
  const units: LogicalUnit<T>[] = [];
  const groupSlot = new Map<string, number>(); // group_id -> index into `units`
  const groupMembers = new Map<string, T[]>();

  for (const row of rows) {
    const gid = row.question_group_id;
    if (!gid) {
      units.push({ lead: row, memberIds: [row.id] });
      continue;
    }
    if (!groupSlot.has(gid)) {
      groupSlot.set(gid, units.length);
      groupMembers.set(gid, [row]);
      units.push({ lead: row, memberIds: [row.id] }); // placeholder; finalized below
    } else {
      groupMembers.get(gid)!.push(row);
    }
  }

  for (const [gid, idx] of groupSlot) {
    const members = groupMembers
      .get(gid)!
      .slice()
      .sort((a, b) => (a.part_index ?? 0) - (b.part_index ?? 0));
    units[idx] = { lead: members[0], memberIds: members.map((m) => m.id) };
  }

  return units;
}
