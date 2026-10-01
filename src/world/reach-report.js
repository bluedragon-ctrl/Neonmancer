/**
 * Turns a WorldReach (reach-world.js) into text for the checker script and
 * into plain data for the editor tools. Plain logic.
 */

const list = (abilities) => (abilities.length === 0 ? 'nothing' : abilities.join(' + '));

/** "needs" of a target as words: "free", "double_jump", "warp or blink + pull", "several", "never". */
export function describeNeeds(needs) {
  if (needs === null) return 'never';
  if (needs.length === 0) return 'several';
  if (needs.length === 1 && needs[0].length === 0) return 'free';
  return needs.map((set) => set.join(' + ')).join(' or ');
}

/**
 * @param {import('./reach-world.js').WorldReach} report
 * @param {{ rooms?: boolean, json?: boolean }} [options] `rooms`: list what each target needs; `json`: plain data instead of text
 */
export function formatReach(report, { rooms = false, json = false } = {}) {
  if (json) {
    return {
      errors: report.errors,
      warnings: report.warnings,
      abilities: report.abilities,
      access: report.access,
      rounds: report.rounds,
      targets: report.targets.map(({ room, kind, id, needs, access }) => ({ room, kind, id, needs: describeNeeds(needs), ...(access && { access }) })),
    };
  }
  const lines = [];
  lines.push('The order the world opens in:');
  for (const { round, rooms: entered, gained, access } of report.rounds) {
    const parts = [];
    if (entered.length) parts.push(`enters ${entered.join(', ')}`);
    if (gained.length) parts.push(`finds ${gained.join(', ')}`);
    if (access) parts.push(`access ${access}`);
    lines.push(`  ${round}. ${parts.join('; ')}`);
  }
  if (rooms) {
    lines.push('', 'What each exit and pickup needs (beyond nothing):');
    for (const { room, kind, id, needs, access } of report.targets) {
      const text = describeNeeds(needs);
      if (text !== 'free' || access) lines.push(`  ${room} ${kind} ${id}: ${text}${access ? `, access ${access}` : ''}`);
    }
  }
  for (const warning of report.warnings) lines.push(`warning: ${warning}`);
  for (const error of report.errors) lines.push(`error: ${error}`);
  lines.push(report.errors.length > 0 ? `${report.errors.length} reachability problem(s).` : 'Everything is reachable.');
  return lines.join('\n');
}

/**
 * The part of a world report that concerns one room: its problems and
 * warnings (messages starting with "<id>:"), its targets, and the round
 * he first enters it in.
 * @param {import('./reach-world.js').WorldReach} report
 * @param {string} id
 */
export function roomOfReport(report, id) {
  const mine = (message) => message.startsWith(`${id}:`);
  const round = report.rounds.find((r) => r.rooms.includes(id));
  return {
    round: round?.round ?? null,
    errors: report.errors.filter(mine),
    warnings: report.warnings.filter(mine),
    targets: report.targets.filter((t) => t.room === id),
  };
}

/**
 * One room as text: the needs of each exit and pickup, then its problems.
 * @param {string} id
 * @param {{ round?: number|null, errors: string[], warnings: string[], targets: object[] }} part roomOfReport() or analyzeRoomAlone()
 * @param {string} [note] what the verdict assumes, printed first
 */
export function formatRoom(id, { round = null, errors, warnings, targets }, note) {
  const lines = [note ?? (round ? `${id}: first entered in round ${round} of the world's order.` : `${id}: never entered.`)];
  for (const { kind, id: target, needs, access } of targets) {
    lines.push(`  ${kind} ${target}: ${describeNeeds(needs)}${access ? `, access ${access}` : ''}`);
  }
  for (const warning of warnings) lines.push(`warning: ${warning}`);
  for (const error of errors) lines.push(`error: ${error}`);
  lines.push(errors.length > 0 ? `${errors.length} reachability problem(s) in ${id}.` : `${id}: everything in it is reachable.`);
  return lines.join('\n');
}
