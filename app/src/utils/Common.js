// Common visualization code

import Values from "../constants/Values";
import * as kextract from "keyword-extractor";
import * as stemmer from "stemmer";

export const getPaper = async (id, params) => fetch(Values.API_URL + `/get_paper?n=${params.maxGetCount}&q=${id}&abs=1&citcon=1&citedBy=${params.citedBy}`).then(async (res) => (await res.json()).result).catch(() => []);
export const getRefs = async (id, params) => fetch(Values.API_URL + `/get_refs?n=${params.maxGetCount}&id=${id}&abs=1&citcon=1&citedBy=${params.citedBy}`).then(async (res) => (await res.json()).result).catch(() => []);
export const getCites = async (id, params) => fetch(Values.API_URL + `/get_cites?n=${params.maxGetCount}&id=${id}&abs=1&citcon=1&citedBy=${params.citedBy}`).then(async (res) => (await res.json()).result).catch(() => []);
export const solveLP = async (model) => fetch(Values.API_URL + "/solve", {
    method: 'POST',
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(model)
}).then(async (res) => {
    const data = await res.json();
    return [data.lpstatus, data.result];
})

// Convert a list to a set (dictionary of `true` values for items in the set)
export const listToSet = (list, keyFxn) => list.reduce((acc, e) => {
    acc[keyFxn ? keyFxn(e) : e] = true;
    return acc;
}, {});

// Extract, stem, and tag keywords for each title.
export function processKeywords(papers, params) {
    // Identify keywords among all titles
    const corpus = papers.map(p => p.title).join(". ");
    const keywords = kextract
        .extract(corpus, {language: 'english', return_changed_case: true})
        .map(stemmer)
        .reduce((acc, e) => {
            // Keep track of the count and full-form occurences for each keyword
            acc[e] = {count: 0, list: {}};
            return acc;
        }, {});

    // Stem keywords for tagging
    const keepWordStemmer = word => [stemmer(word), word];
    const splitStemTitle = title => title.split(" ").map(keepWordStemmer);
    const stems = papers.reduce((acc, p) => acc.concat(splitStemTitle(p.title)), []);
    stems.forEach(([stem, word]) => {
        if (keywords[stem]) {
            keywords[stem].count++;
            keywords[stem].list[word] = true;
        }
    });

    // Keep only important keywords (which occur often enough)
    const salientKeywords = Object.keys(keywords).reduce((acc, key) => {
        if (keywords[key].count > params.minKeywordInstances) {
            acc[key] = keywords[key];
        }
        return acc;
    }, {});

    // Tag each paper with a list of keywords in its title
    papers.forEach(p =>
        (p.keywords = splitStemTitle(p.title)
            .filter(([stem]) => salientKeywords[stem])
            .map(([stem]) => stem)));

    // Turn papers from a list into a dictionary
    const paperDict = papers.reduce((acc, p) => {
        acc[p.bibcode] = p;
        return acc;
    }, {});

    return {
        params: params,
        focus: papers[0].bibcode,
        papers: paperDict,
        keywords: salientKeywords
    };
}

// Identify subgraph in the citation network to render into storylines.
export function processGraph(data) {
    console.log("PROCESS GRAPH DATA", data)

    // Populate connectivity data: link each paper to its children
    Object.values(data.papers).forEach((p) => p.children = [])
    Object.values(data.papers)
        .forEach((p) => p.citation?.forEach((pID) => data.papers[pID]?.children.push(p.bibcode)))

    // For each keyword, create a subgraph from the citation network that
    // contains only papers containing that keyword in the title.
    // Then, use BFS to identify connected components in that subgraph.
    // These components become the storylines for that keyword.
    const keywordComponents = {};
    for (let keyword of Object.keys(data.keywords)) {
        // Setup unvisited list
        const unvisited = listToSet(Object.values(data.papers).filter((p) => p.keywords.includes(keyword)), (p) => p.bibcode);

        keywordComponents[keyword] = []

        // Explore graph using BFS
        while (Object.keys(unvisited).length) {
            const component = []
            const queue = []
            queue.push(Object.keys(unvisited)[0])
            delete unvisited[queue[0]]
            while (queue.length) {
                const next = queue.shift()
                // Add to component
                component.push(next)
                // Edges
                const paper = data.papers[next]
                for (let edge of [...(paper.citation || []), ...paper.children]) {
                    if (unvisited[edge]) {
                        delete unvisited[edge]
                        queue.push(edge)
                    }
                }
            }
            const sortedComponent = component.sort((a, b) => data.papers[a].year - data.papers[b].year)
            keywordComponents[keyword].push(sortedComponent)
        }
    }

    data.components = keywordComponents
    return data;
}

export function prepareLayout(data) {
    const params = data.params;

    // Get character position of keywords in title
    Object.values(data.papers).forEach(paper => {
        const kwOffsets = {};
        const words = paper.title.split(" ");
        const stems = words.map(stemmer);
        Object.values(paper.keywords).forEach(keyword => {
            const wordNum = stems.indexOf(keyword);
            kwOffsets[keyword] =
                words.slice(0, wordNum).reduce((acc, e) => acc + e.length, 0) + wordNum;
        });
        paper.kwOffsets = kwOffsets;
    });

    // Sort papers by year then citation topology
    const sequence = Object.keys(data.papers).sort((a, b) => {
        if (data.papers[a].year != data.papers[b].year) return data.papers[a].year - data.papers[b].year;
        else if (data.papers[a].citation?.includes(data.papers[b].bibcode)) return 1;
        else if (data.papers[b].citation?.includes(data.papers[a].bibcode)) return -1;
        else return 0;
    });
    // Compute storyline sequence and locations
    sequence.forEach((id, i) => {
        const paper = data.papers[id];
        paper.index = i;
        const yLength = String(paper.year).length + 3;
        const cLength = String(paper.citation_count).length + 3;
        paper.layout = {
            x: 0,
            yLength,
            cLength,
            width: (yLength + data.papers[id].title.length + cLength) * params.charWidth
        };
    });

    // Set up colors
    let colorCounter = 4;
    const nextColor = () => Values.COLORS[Math.floor(colorCounter++ % Values.COLORS.length)];

    let edges = {};
    Object.entries(data.components).forEach(([keyword, components]) => {
        edges[keyword] = [];
        components.forEach(pids => {
            if (pids.length > params.minStops) {
                // Set color
                data.keywords[keyword].color = nextColor();

                // Change this to change the minimum storyline length
                const points = pids
                    .sort((a, b) => data.papers[a].index - data.papers[b].index)
                    .map((id, i) => ({
                        x: (data.papers[id].kwOffsets[keyword] + data.papers[id].layout.yLength + 1) * params.charWidth, // +1 to get to first char
                        pid: id
                    }));
                points.forEach(({pid}) => (data.papers[pid].hasEdge = true));
                edges[keyword].push(points);
            }
        });
    });
    data.edges = edges;
    data.sequence = sequence;

    return data;
}

export function postLayout(data) {
    const params = data.params;

    let index = 0;
    data.sequence.forEach((id) => {
        const paper = data.papers[id];

        // Determine if paper is shown
        if (params.hideUnmapped && paper.unmapped) paper.hidden = true;
        else if (params.minCitations > paper.citation_count) paper.hidden = true;
        else paper.hidden = false;

        // Update y-positions
        if (!paper.hidden) {
            paper.layout.y = index * (params.charHeight + params.ySpace);
            index++;
        }

        // Stop exploding graphs
        if (paper.layout.x) paper.layout.x = Math.min(paper.layout.x, params.maxX)
    });

    // Find max citations
    data.maxCitations = Object.values(data.papers).reduce((acc, p) => Math.max(acc, p.citation_count), 0);

    return data;
}

export function computeMaxBounds(data) {
    const params = data.params;

    // Compute max bounds
    let minX = Number.MAX_VALUE,
        minY = Number.MAX_VALUE,
        maxX = Number.MIN_VALUE,
        maxY = Number.MIN_VALUE;
    Object.values(data.papers).forEach(paper => {
        if (!paper.hidden) {
            minX = Math.min(paper.layout.x - (paper.layout.rightAlign ? paper.layout.width : 0), minX);
            minY = Math.min(paper.layout.y, minY);
            maxX = Math.max(paper.layout.x + (paper.layout.rightAlign ? 0 : paper.layout.width), maxX);
            if (paper.excerpts && params.showExcerpts) maxX = Math.max(maxX, ...paper.excerpts.map((e) => paper.layout.x + (e.length + 6) * params.excerptCharWidth));
            maxY = Math.max(paper.layout.y + params.ySpace, maxY);
        }
    });

    return {minX, minY, maxX, maxY};
}

export function computeYearBands(data) {
    let bands = [];
    let currentYear = null;
    let currentSpan = [];
    data.sequence.forEach((pid) => {
        const paper = data.papers[pid];
        if (!paper.hidden) {
            currentSpan[1] = pid;
            if (paper.year !== currentYear) {
                if (currentYear !== null) {
                    bands.push([...currentSpan]);
                }
                currentYear = paper.year;
                currentSpan[0] = pid;
            }
        }
    });
    if (currentYear !== null) bands.push(currentSpan);

    return bands;
}

export const getViewBox = (maxDims) => [
    maxDims.minX - (maxDims.maxX - maxDims.minX) * 0.1,
    maxDims.minY - (maxDims.maxX - maxDims.minX) * 0.1,
    (maxDims.maxX - maxDims.minX) * 1.2,
    (maxDims.maxY - maxDims.minY) * 1.2
];

