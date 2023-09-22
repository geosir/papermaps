// General utilities

import Values from "../constants/Values";

export const renderAuthors = (authors, full) => {
    if (authors.length > 3 && !full) {
        return authors[0].split(",")[0] + ", et al.";
    } else {
        return authors.map((a) => a.split(",")[0]).join(", ")
    }
}

// Helper to evaluate a fxn (curr, prev, i) over a sliding window on an array
export const slide = (arr, fxn) => arr.slice(1).forEach((e, i) => fxn(e, arr[i], i + 1));

// Helper to compute pixels for character size.
export function computeCharSize(size = 12, font = "Roboto Mono") {
    const element = document.createElement('canvas');
    const context = element.getContext("2d");
    context.font = `${size}px "${font}"`;
    const measure = context.measureText("A");
    // console.log("MEASURE", context.font);
    // console.log(measure);
    return [
        measure.width,
        // measure.actualBoundingBoxRight - measure.actualBoundingBoxLeft,
        // 2.2 * (measure.actualBoundingBoxAscent + measure.actualBoundingBoxDescent) ||
        measure.width * 3
    ];
}

// Helper to make menu options
export const genericMakeMenuHandler = (props, data, p, expansions, makeInspectTitle, selectExpansions, selectKW, keyword, setMenuData) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const computeRemoves = () => {
        const notThisPaper = Object.values(data.papers).filter(o => o.Id !== p.Id);
        const connected = notThisPaper.filter(other => (other.RId?.includes(p.Id) || p.RId?.includes(other.Id)));
        const orphaned = connected.filter(other => !(other.RId?.some(id => id !== p.Id && data.papers[id]) || notThisPaper.some(p => p.RId?.includes(other.Id))));
        return orphaned.length;
    }
    setMenuData({
        position: {x: e.pageX, y: e.pageY},
        pid: p.Id,
        inspect: makeInspectTitle(p.Id),
        ...expansions.includes(String(p.Id)) ? {
            collapse: {
                removes: computeRemoves(),
                doCollapse: () => selectExpansions(expansions.filter(id => id !== String(p.Id)))
            }
        } : {
            expand: {
                adds: (p.citedBy?.filter(pid => !data.papers[pid]).length || 0) + (p.RId?.filter(pid => !data.papers[pid]).length || 0),
                common: (p.citedBy?.filter(pid => data.papers[pid]).length || 0) + (p.RId?.filter(pid => data.papers[pid]).length || 0),
                doExpand: () => selectExpansions(expansions.concat([String(p.Id)]))
            }
        },
        selectKW: () => selectKW(p.keywords.filter((k) => data.keywords[k])),
        paperKeywords: p.keywords.filter((k) => data.keywords[k]),
        ...keyword && {selectOneKW: () => selectKW([keyword]), singleKeyword: keyword}
    });
    logEvent('menu', {pid: p.Id, keyword: keyword, position: {x: e.pageX, y: e.pageY}});
}

export const genericMakeInspectTitle = (id, props, search, history, location, hash) => (e) => {
    e.preventDefault();
    search.set("inspect", id);
    if (props.setInspect) props.setInspect(id);
    history.push(location.pathname + "?" + search + (hash || ''));
}

export const genericSelectKW = (keywords, search, setSelectedKW, history, location) => {
    search.set("k", keywords);
    setSelectedKW(keywords);
    history.push(location.pathname + "?" + search);
    logEvent('select_keywords', {pathname: location.pathname, keywords: keywords});
}

export const genericSelectExpansions = (exp, search, setExpansions, history, location) => {
    search.set("e", exp);
    setExpansions(exp);
    history.push(location.pathname + "?" + search);
    logEvent('select_expansions', {pathname: location.pathname, exp: exp});
}

// TODO: I would use a set-like data structure for selectedKW, except that updating it doesn't seem to trigger a
// TODO: react update.
export const genericMakeAddKeyword = (keyword, selectedKW, selectKW) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedKW.includes(keyword)) {
        selectKW(selectedKW.concat([keyword]));
        logEvent('add_keyword', {pathname: window.location.pathname, keyword});
    }
}

export const genericMakeRemoveKeyword = (keyword, selectedKW, selectKW) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectKW(selectedKW.filter(k => k !== keyword))
    logEvent('remove_keyword', {pathname: window.location.pathname, keyword});
}

// Helper to log events
export const logEvent = (event, data) => fetch(Values.API_URL + "/log_event", {
    method: 'POST',
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        sessionID: window.papermapsSessionID,
        event,
        data: JSON.stringify(data),
        timestamp: Date.now()
    })
})