interface Group {
  size: number;
  groups?: Group[];
}

export interface EditorLayoutViewSize {
  orientation: 0 | 1;
  groups: Group[];
}

const PochiLayoutSizeLeft = 0.35;
const PochiLayoutSizeRightTop = 0.7;

export const PochiLayoutViewSize: EditorLayoutViewSize = {
  orientation: 0, // Left-right
  groups: [
    {
      size: PochiLayoutSizeLeft, // Left: pochiTaskGroup
    },
    {
      size: 1 - PochiLayoutSizeLeft, // Right
      groups: [
        {
          size: PochiLayoutSizeRightTop, // Right Top: editorsGroup
        },
        {
          size: 1 - PochiLayoutSizeRightTop, // Right Bottom: terminalGroup
        },
      ],
    },
  ],
};

export function countTabGroups(groups: Group[]) {
  const countGroups = (group: Group): number => {
    if (group.groups && group.groups.length > 0) {
      return sumGroups(group.groups);
    }
    return 1;
  };
  const sumGroups = (groups: Group[]): number => {
    return groups.reduce((a, c) => a + countGroups(c), 0);
  };
  return sumGroups(groups);
}

export function isPochiLayoutViewSize(layout: EditorLayoutViewSize): boolean {
  if (countTabGroups(layout.groups) !== 3) {
    return false;
  }
  if (layout.orientation !== PochiLayoutViewSize.orientation) {
    return false;
  }
  if (layout.groups.length !== 2) {
    return false;
  }
  const sizeL = layout.groups[0].size;
  const sizeR = layout.groups[1].size;
  if (Math.abs(sizeL / (sizeL + sizeR) - PochiLayoutSizeLeft) > 0.1) {
    return false;
  }
  const groupR = layout.groups[1].groups;
  if (!groupR || groupR.length !== 2) {
    return false;
  }
  const sizeRT = groupR[0].size;
  const sizeRB = groupR[1].size;
  if (Math.abs(sizeRT / (sizeRT + sizeRB) - PochiLayoutSizeRightTop) > 0.1) {
    return false;
  }
  return true;
}
