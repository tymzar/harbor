// The same page changes as mutate.ts, made to a real DOM so the real scanner reads the result
// (layout, visibility, text and the 80-character text cut all come from the browser). Runs in the page.

type Marked = Element & { fpOrigin?: string; fpCloneOf?: string; fpSameAs?: string };

function rng(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
}

const WORDS = ["lorem", "ipsum", "dolor", "amet", "velit", "nostra", "porta", "magna", "turpis", "lectus", "fusce", "urna"];
function translate(text: string): string {
  return text.replaceAll(/\p{L}{2,}/gu, (word) => {
    let value = 7;
    for (const char of word.toLowerCase()) value = (value * 31 + (char.codePointAt(0) ?? 0)) % 9973;
    return `${WORDS[value % WORDS.length]}${value % 7}`;
  });
}

const textNodes = () => {
  const list: Array<Text> = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    if (node.parentElement && !["SCRIPT", "STYLE"].includes(node.parentElement.tagName) && node.nodeValue?.trim()) list.push(node as Text);
  return list;
};

const byOrigin = (origin: string) => [...document.querySelectorAll("body *")].find((element) => (element as Marked).fpOrigin === origin);

// Layout of the element copied to a wrapper put inside it, so the page still looks the same.
function inheritLayout(from: Element, to: HTMLElement) {
  const style = getComputedStyle(from);
  for (const name of ["display", "flex-direction", "flex-wrap", "gap", "grid-template-columns", "align-items", "justify-content"])
    to.style.setProperty(name, style.getPropertyValue(name));
}

function aimed(random: () => number, targets: Array<string>, count: number): Array<Element> {
  const chosen = targets.flatMap((origin) => byOrigin(origin) ?? []).filter(() => random() < 0.6);
  const lists = [...document.querySelectorAll("body *")].filter((element) => element.children.length >= 2 && !["SCRIPT", "STYLE"].includes(element.tagName));
  while (chosen.length < count && lists.length > 0) chosen.push(lists[Math.floor(random() * lists.length)]);
  return [...new Set(chosen)];
}

const sameKindRows = (element: Element) => [...element.children].filter((child) => child.tagName === element.children[0]?.tagName);

const MUTATIONS: Record<string, (random: () => number, targets: Array<string>) => void> = {
  none: () => {},

  "class-hash": () => {
    const names = new Map<string, string>();
    for (const element of document.querySelectorAll("[class]"))
      for (const name of element.classList) if (!names.has(name)) names.set(name, `c_${Math.abs([...name].reduce((sum, char) => sum * 33 + (char.codePointAt(0) ?? 0), 5381) % 1e6).toString(36)}`);
    for (const element of document.querySelectorAll("[class]")) element.className = [...element.classList].map((name) => names.get(name)).join(" ");
    for (const style of document.querySelectorAll("style"))
      style.textContent = (style.textContent ?? "").replaceAll(/\.([A-Za-z_][\w-]*)/g, (match, name: string) => (names.has(name) ? `.${names.get(name)}` : match));
  },

  "id-churn": (random) => {
    for (const element of document.querySelectorAll("[id]")) {
      const next = `r${Math.floor(random() * 1e9).toString(36)}`;
      for (const style of document.querySelectorAll("style")) style.textContent = (style.textContent ?? "").replaceAll(`#${element.id}`, `#${next}`);
      element.id = next;
    }
  },

  wrapper: (random, targets) => {
    for (const element of aimed(random, targets, 3)) {
      const wrapper = document.createElement("div");
      (wrapper as Marked).fpSameAs = (element as Marked).fpOrigin;
      if (element.children.length >= 2 && random() < 0.5) {
        inheritLayout(element, wrapper);
        wrapper.append(...element.childNodes);
        element.append(wrapper);
      } else {
        const badge = document.createElement("span");
        badge.textContent = "New";
        element.replaceWith(wrapper);
        wrapper.append(element, badge);
      }
    }
  },

  insert: (random, targets) => {
    for (const element of aimed(random, targets, 2).slice(0, 3)) {
      const ad = document.createElement("div");
      ad.style.cssText = "height:90px;display:flex;gap:8px;align-items:center;background:#eee";
      ad.innerHTML = '<span>Sponsored</span><a href="https://ads.example/click">Shop now</a><img alt="" width="120" height="80" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">';
      element.before(ad);
    }
  },

  reorder: (random, targets) => {
    for (const element of aimed(random, targets, 1).slice(0, 2))
      for (let current: Element | null = element; current?.parentElement; current = current.parentElement) {
        const own = current;
        const others = [...own.parentElement!.children].filter((other) => other !== own && other.getBoundingClientRect().height > 20 && !["SCRIPT", "STYLE"].includes(other.tagName));
        if (others.length === 0) continue;
        const other = others[Math.floor(random() * others.length)];
        const marker = document.createComment("");
        own.replaceWith(marker);
        other.replaceWith(own);
        marker.replaceWith(other);
        break;
      }
  },

  "text-counters": (random) => {
    for (const node of textNodes()) node.nodeValue = node.nodeValue!.replaceAll(/\d+/g, () => String(Math.floor(random() * 5000)));
  },

  "text-copy": (random) => {
    for (const node of textNodes()) if (random() < 0.33) node.nodeValue = node.nodeValue!.replace(/\p{L}{3,}/u, (word) => `${word}s now`);
  },

  "text-translate": () => {
    for (const node of textNodes()) node.nodeValue = translate(node.nodeValue!);
    for (const element of document.querySelectorAll("[aria-label],[alt],[title]"))
      for (const name of ["aria-label", "alt", "title"]) if (element.hasAttribute(name)) element.setAttribute(name, translate(element.getAttribute(name)!));
  },

  // The window is resized by the caller.
  viewport: () => {},

  "list-grow": (random, targets) => {
    for (const element of aimed(random, targets, 3)) {
      const rows = sameKindRows(element);
      if (rows.length < 2) continue;
      const last = rows.at(-1)!;
      for (let index = 0; index < 1 + Math.floor(random() * 3); index += 1) {
        const clone = last.cloneNode(true) as Marked;
        clone.fpCloneOf = (last as Marked).fpOrigin;
        for (const anchor of clone.querySelectorAll("a")) anchor.href = `${anchor.href}-${index}`;
        const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) node.nodeValue = node.nodeValue!.replaceAll(/\p{L}{4,}/gu, () => `item${Math.floor(random() * 1e6)}`);
        last.after(clone);
      }
    }
  },

  "list-shrink": (random, targets) => {
    for (const element of aimed(random, targets, 3)) {
      const rows = sameKindRows(element);
      if (rows.length < 3) continue;
      for (const row of rows.slice(1).filter(() => random() < 0.4).slice(0, rows.length - 2)) row.remove();
    }
  },

  redesign: (random, targets) => {
    const element = targets.length > 0 ? byOrigin(targets[Math.floor(random() * targets.length)]) : undefined;
    if (!element) return;
    const fresh = document.createElement("div");
    const { width, height } = element.getBoundingClientRect();
    fresh.style.cssText = `width:${width}px;min-height:${height}px`;
    fresh.innerHTML = `<h3>Picks for you</h3><div style="display:flex;gap:8px">${[1, 2, 3].map((index) => `<a href="/picks/${index}">Pick ${Math.floor(random() * 1e6)}</a>`).join("")}</div>`;
    element.replaceWith(fresh);
  },
};

MUTATIONS["ab-variant"] = (random, targets) => {
  for (const name of ["wrapper", "insert", "text-copy", "id-churn"]) MUTATIONS[name](random, targets);
};

declare global {
  var fpMutate: (name: string, seed: number, targets: Array<string>) => void;
  var fpMutations: Array<string>;
}
globalThis.fpMutate = (name, seed, targets) => MUTATIONS[name](rng(seed), targets);
globalThis.fpMutations = Object.keys(MUTATIONS);

export {};
