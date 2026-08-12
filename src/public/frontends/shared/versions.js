/** Renders the version switcher shared by every frontend. */
export function mountVersionSwitcher(target, versions, current, page = "") {
  if (!target) return;
  target.innerHTML = "";
  for (const version of versions) {
    const link = document.createElement("a");
    link.href = page ? `/${version}/${page}/` : `/${version}/`;
    link.textContent = version;
    if (version === current) link.setAttribute("aria-current", "page");
    target.append(link);
  }
}

/** Renders the group switcher — the pages within one frontend version. */
export function mountGroupNav(target, groups, current, version) {
  if (!target) return;
  target.innerHTML = "";
  for (const group of groups) {
    const link = document.createElement("a");
    link.href = `/${version}/${group}/`;
    link.textContent = group;
    if (group === current) link.setAttribute("aria-current", "page");
    target.append(link);
  }
}
