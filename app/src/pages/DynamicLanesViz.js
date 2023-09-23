import React, {useEffect, useState} from "react";
import {useHistory, useLocation} from "react-router-dom";
import * as stemmer from "stemmer";
import {
    computeCharSize, genericMakeAddKeyword,
    genericMakeInspectTitle,
    genericMakeMenuHandler, genericMakeRemoveKeyword,
    genericSelectExpansions,
    genericSelectKW, logEvent,
} from "../utils/Utils";
import {
    getPaper,
    getCites,
    getRefs,
    processKeywords,
    processGraph,
    prepareLayout,
    computeMaxBounds,
    computeYearBands,
    getViewBox, postLayout
} from "../utils/Common";
import {processLayoutForLanes} from "../utils/Lanes";

// Components
import {PanSVG} from "../components/PanSVG";
import SearchPaper from "../components/SearchPaper";
import InspectPaper from "../components/InspectPaper";
import Loader from "react-loader-spinner";
import {MapFilter} from "../components/MapFilter";

// Compute visual params
const [charWidth, charHeight] = computeCharSize();
// console.log("C", charHeight, charWidth);
const [excerptCharWidth, excerptCharHeight] = computeCharSize(10);
// console.log("E", excerptCharHeight, excerptCharWidth)
const params = ({
    minStops: 0, // Minimum number of titles a storyline needs to be drawn
    minKeywordHighlight: 1, // Minimum number of titles a storyline needs to show clickable keywords
    minKeywordInstances: 0, // Minimum number of instances needed for a keyword to be considered salient
    maxGetCount: 100, // Number of entities to get when querying MAG
    xSpace: 128, // Horizontal spacing between paper titles and unrelated lines
    ySpace: charHeight / 2, // Vertical spacing between paper titles
    maxX: 5000, // Maximum x-position (stop exploding maps)
    charWidth: charWidth, // SVG pixel width of one character
    charHeight: charHeight, // SVG pixel height of title
    excerptLeadPad: excerptCharHeight / 4,
    excerptCharWidth: excerptCharWidth,
    excerptCharHeight: excerptCharHeight,
    excerptLength: 150,
    lineThickness: 8,
    bigNumber: 1e5,
    spaceWeight: 1,
    straightWeight: 1
});

export default function DynamicLanesViz(props) {

    // Hotfix to wait until fonts are ready
    // TODO: This is pretty much a hack. Clean up in production.
    const [fontsLoaded, setFontsLoaded] = useState(false);
    const [charWidth, setCharWidth] = useState(params.charWidth);
    useEffect(() => {
        let timeout;
        const checkFonts = () => {
            if (document.fonts.check("12px \"Roboto Mono\"")) {
                console.log("FONTS LOADED")

                // Force update font sizes
                setCharWidth(computeCharSize()[0])

                setFontsLoaded(true);
            } else {
                console.log("Waiting for fonts...");
                timeout = setTimeout(checkFonts, 200);
            }
        }
        checkFonts();

        return () => {
            clearTimeout(timeout);
        }
    });


    const paperID = props.match.params.id;

    const history = useHistory();
    const location = useLocation();
    const search = new URLSearchParams(location.search);

    const [graphData, setGraphData] = useState(null);
    const [data, setData] = useState(null);
    const [maxDims, setMaxDims] = useState({x: 0, y: 0, w: 0, h: 0});
    const [selectedKW, setSelectedKW] = useState(search.get('k')?.split(',').filter(x => x) || []);
    const [expansions, setExpansions] = useState(search.get('e')?.split(',').filter(x => x) || []);
    const [bands, setBands] = useState([]);
    const [kwfilter, setKWFilter] = useState('');
    const [status, setStatus] = useState(null);
    const [panning, setPanning] = useState(false);
    const [inspect, setInspect] = useState(paperID);
    const [searched, setSearched] = useState(search?.get("q"))
    const [menuData, setMenuData] = useState(null);

    const [showExcerpts, setShowExcerpts] = useState(false);
    const [showUnmapped, setShowUnmapped] = useState(false);
    const [minCitations, setMinCitations] = useState(0);
    const [getCount, setGetCount] = useState(params.maxGetCount);

    const [kwSort, setKWSort] = useState('count');

    const [showMapPanel, setShowMapPanel] = useState(true);

    const makeInspectTitle = (id, hash) => {
        setInspect(id);
        return genericMakeInspectTitle(id, props, search, history, location, hash);
    }
    const selectKW = (keywords) => genericSelectKW(keywords, search, setSelectedKW, history, location);
    const selectExpansions = (exp) => genericSelectExpansions(exp, search, setExpansions, history, location)
    const makeAddKeyword = (keyword) => genericMakeAddKeyword(keyword, selectedKW, selectKW);
    const makeRemoveKeyword = (keyword) => genericMakeRemoveKeyword(keyword, selectedKW, selectKW);
    const makeMenuHandler = (p, keyword) => genericMakeMenuHandler(props, data, p, expansions, makeInspectTitle, selectExpansions, selectKW, keyword, setMenuData)

    const makeHighlightExcerpt = (inspected, excerptID, excerptIndex) => (e) => {
        makeInspectTitle(inspected, `#ex-${excerptID}-${excerptIndex}`)(e);
    }

    // Helpers
    const truncateExcerpt = (e) => {
        if (e.length > params.excerptLength) return e.slice(0, params.excerptLength) + "..."
        else return e;
    }

    const getKeywordExample = (k) => Object.keys(data.keywords[k].list)[0];

    const getKeywordCount = (k) => Object.values(data.papers).filter((p) => p.keywords.includes(k)).length;
    const getKeywordLineCount = (k) => data.edges[k]?.filter((e) => e.length > 1).length;

    // Compute inline citation positions
    const computeExcerpts = (data) => {
        const params = data.params;
        const focus = data.papers[data.focus];

        let yAcc = 0;
        data.sequence.forEach((id) => {
            const paper = data.papers[id];

            // Update y-positions
            if (showExcerpts && !paper.hidden) {
                paper.layout.y = yAcc;
                yAcc += params.charHeight;

                if (focus.CitCon?.[paper.bibcode]) {
                    paper.excerpts = focus.CitCon[paper.bibcode].map(truncateExcerpt);
                    paper.excerptsType = 'citedByFocus';
                } else if (paper.CitCon?.[data.focus]) {
                    paper.excerpts = paper.CitCon[data.focus].map(truncateExcerpt);
                    paper.excerptsType = 'citesFocus';
                }
                if (paper.excerpts?.length) {
                    yAcc += params.excerptLeadPad + params.excerptCharHeight * paper.excerpts.length;
                }

                yAcc += params.ySpace;
            }
        });

        return data;
    }

    useEffect(() => {
        if (!fontsLoaded) return; // Wait for fonts

        // TODO: This is a hack. Fix in production!
        const charHeight = charWidth * 3;
        const excerptCharWidth = charWidth * 10 / 12;
        const excerptCharHeight = excerptCharWidth * 3;
        const update = {
            ySpace: charHeight / 2, // Vertical spacing between paper titles
            charWidth: charWidth, // SVG pixel width of one character
            charHeight: charHeight, // SVG pixel height of title
            excerptLeadPad: excerptCharHeight / 4,
            excerptCharWidth: excerptCharWidth,
            excerptCharHeight: excerptCharHeight,
        }
        Object.entries(update).forEach(([key, value]) => params[key] = value);
        console.log(params.charWidth);

        setBands([]);
        setData(null);
        if (props.getCount !== undefined) params.maxGetCount = getCount;
        params.hideUnmapped = !showUnmapped;
        params.showExcerpts = showExcerpts;
        params.citedBy = true;
        if (paperID) {
            (async () => {
                setStatus({status: 'working', message: "Getting Papers..."});
                const level0 = await getPaper(paperID, params);
                const level1 = [...await getRefs(paperID, params), ...await getCites(paperID, params)];
                console.log("EXPANSIONS", expansions)
                const expanded = expansions.length ? [
                    ...await getPaper(expansions.join(","), params),
                    ...await getRefs(expansions.join(","), params),
                    ...await getCites(expansions.join(","), params)] : [];
                const papers = [...level0, ...level1, ...expanded];
                // const papers = [...level0, ...level1];

                setStatus({status: 'working', message: "Structuring Papers..."});

                const graphData = prepareLayout(processGraph(processKeywords(papers, params)));
                setGraphData(graphData);
                if (!selectedKW.length) selectKW(papers[0].keywords.filter((k) => graphData.keywords[k]));
            })();
        }
    }, [getCount, expansions, fontsLoaded, charWidth])

    useEffect(() => {
        if (graphData) {
            (async () => {
                if (selectedKW.length) {
                    // Compute drawing data
                    graphData.params.hideUnmapped = !showUnmapped;
                    graphData.params.minCitations = minCitations;
                    setStatus({status: 'working', message: "Drawing..."});
                    const newData = computeExcerpts(postLayout(await processLayoutForLanes(graphData, selectedKW)));
                    // console.log(newData);
                    setStatus({
                        status: newData.lpstatus === 'Optimal' ? 'success' : 'error',
                        message: newData.lpstatus === 'Optimal' ? "Best Layout" : "Too Complex"
                    });
                    setData(newData);
                    setMaxDims(computeMaxBounds(newData));
                    setBands(computeYearBands(newData));
                }
            })();
        }
    }, [selectedKW, graphData]);

    useEffect(() => {
        if (data) {
            data.params.hideUnmapped = !showUnmapped;
            data.params.minCitations = minCitations;
            params.showExcerpts = showExcerpts;
            const newData = computeExcerpts(postLayout(data));
            setData(newData);
            setMaxDims(computeMaxBounds(newData));
            setBands(computeYearBands(newData));
        }
    }, [showUnmapped, minCitations, showExcerpts])

    useEffect(() => {
        logEvent('dynamic_lanes', {
            pid: paperID,
            pathname: location.pathname,
            search: location.search,
            hash: location.hash
        });
    }, []);

    // Handle URL navigation
    useEffect(() => {
        setSearched(search?.get("q"));
        if (search?.get("inspect")) setInspect(search?.get("inspect"));
        else setInspect(paperID);
        console.log("INSPECT", inspect)
    }, [location]);

    // DEBUG
    useEffect(() => {
        console.log("DATA", data)
    }, [data])

    // Rendering
    // Draw paper titles
    const makeTitle = (data, p) => p.title.split(" ").reduce((acc, w, i) => {
        const keyword = stemmer(w);
        if (!acc.tagged.includes(keyword) &&
            data.keywords[keyword] &&
            data.edges[keyword].some(e => e.some(point => String(point.pid) === String(p.bibcode)))) {
            if (selectedKW.includes(keyword)) {
                acc.result.push(<tspan key={p.bibcode + `[${i}]`} className={'keyword'}
                                       onContextMenu={makeMenuHandler(p, keyword)}
                                       onClick={(event) => {
                                           makeRemoveKeyword(keyword)(event);
                                           logEvent('title_remove_keyword', {
                                               pathname: location.pathname,
                                               sourcePID: paperID,
                                               targetPID: p.bibcode,
                                               keyword: keyword
                                           });
                                       }}>{w + " "}</tspan>);
            } else {
                acc.result.push(<>
                    <tspan key={p.bibcode + `[${i}]`}
                           className={(data.edges[keyword].some(e => e.length > params.minKeywordHighlight && e.some(point => String(point.pid) === String(p.bibcode)))) ? 'keyword unselected' : ''}
                           onContextMenu={makeMenuHandler(p, keyword)}
                           onClick={(event) => {
                               makeAddKeyword(keyword)(event);
                               logEvent('title_add_keyword', {
                                   pathname: location.pathname,
                                   sourcePID: paperID,
                                   targetPID: p.bibcode,
                                   keyword: keyword
                               });
                           }}>{w}</tspan>
                    <tspan>{" "}</tspan>
                </>);
            }
            acc.tagged.push(keyword);
        } else acc.result.push(<tspan key={p.bibcode + `[${i}]`}>{w + " "}</tspan>);
        return acc;
    }, {result: [], tagged: []}).result;

    // Bold keywords in excerpts
    const boldExcerptKeywords = (text) => {
        if (!text) return;
        const keywords = selectedKW;
        return text.split(" ").map((word, i) => {
            if (keywords.some((keyword) => word.toLowerCase().match(new RegExp(`^${keyword}`)))) {
                return <tspan style={{fontWeight: 'bold'}} key={i}>{word} </tspan>
            } else return word + " ";
        })
    }

    return <div id={'viz-panel'}>
        {showMapPanel ?
            <div id={'map-panel'}>
                <div id={'map-panel-content'}>
                    {searched ? <SearchPaper/> : <InspectPaper id={inspect} data={data}/>}
                    <div><a href={"javascript:void(0)"} onClick={() => {
                        setShowMapPanel(false);
                        props.setShowSearch(false);
                    }}>
                        Hide Panel
                    </a></div>
                </div>
            </div>
            : <div id={'show-map-panel'}>
                <a href={"javascript:void(0)"} onClick={() => {
                    setShowMapPanel(true);
                    props.setShowSearch(true);
                }}>
                    Show Panel
                </a></div>
        }
        <div style={{pointerEvents: panning ? 'none' : 'auto', overflow: 'hidden', flex: 1, position: 'relative'}}
             onContextMenu={(e) => e.preventDefault()}>
            {Boolean(status) &&
                <div id={'map-status'} className={'status ' + status.status}>
                    {status.status === 'working' &&
                        <Loader type={'Audio'} color={'orange'} height={16} width={16}/>}
                    <span>{status.message}</span>
                </div>}
            <MapFilter
                setShowUnmapped={setShowUnmapped}
                setShowExcerpts={setShowExcerpts}
                setMinCitations={setMinCitations}
                setGetCount={setGetCount}
                setMenuData={setMenuData}
                menuData={menuData}
            />
            {data && <PanSVG setPanning={setPanning} maxDims={maxDims}>
                <g className={'yearbands'}>
                    {bands.map(([start, end], i) => {
                        const viewBox = getViewBox(maxDims);
                        return <rect className={'yearband'}
                                     fill={i % 2 === 0 ? '#eee' : 'white'}
                                     x={viewBox[0]}
                                     y={data.papers[start].layout.y - params.charHeight / 2 - params.ySpace / 2}
                                     width={viewBox[2] - viewBox[0]}
                                     height={data.papers[end].layout.y - data.papers[start].layout.y}
                                     key={data.papers[start].year}
                        />
                    })}
                </g>
                {inspect && !data.papers[inspect]?.hidden &&
                    <rect className={'inspectbox'}
                          fill={"#ff0"}
                          x={data.papers[inspect].layout.x}
                          y={data.papers[inspect].layout.y - params.charHeight / 2}
                          width={data.papers[inspect].layout.width - data.papers[inspect].layout.cLength * params.charWidth}
                          height={params.charHeight}
                    />}
                {expansions.filter((pid) => !data.papers[pid].hidden).map((pid) =>
                    <rect className={'selectbox'}
                          key={pid}
                          stroke={"#0f0"}
                          strokeWidth={3}
                          fill={'transparent'}
                          x={data.papers[pid].layout.x}
                          y={data.papers[pid].layout.y - params.charHeight / 2}
                          width={data.papers[pid].layout.width - data.papers[pid].layout.cLength * params.charWidth}
                          height={params.charHeight}
                    />)}
                {!data.papers[paperID].hidden &&
                    <rect className={'focalbox'}
                          stroke={"#f00"}
                          strokeWidth={3}
                          fill={'transparent'}
                          x={data.papers[paperID].layout.x}
                          y={data.papers[paperID].layout.y - params.charHeight / 2}
                          width={data.papers[paperID].layout.width - data.papers[paperID].layout.cLength * params.charWidth}
                          height={params.charHeight}
                    />}
                {Object.entries(data.edges).filter(([keyword]) => selectedKW.includes(keyword))
                    .map(([keyword, edges], i) => <g className={'storylines'} key={`${keyword}_${i}`}>
                        {edges.map((edge, k) =>
                            <path className={'storyline'}
                                  key={`${keyword}_${i}_${k}`}
                                  d={"M " + edge.filter(({pid}) => !data.papers[pid].hidden).map(({x, pid}) =>
                                      `${x + data.papers[pid].layout.x} ${data.papers[pid].layout.y}`).join(" L ")}
                                  stroke={data.keywords[keyword].color}
                                  strokeWidth={params.lineThickness}
                                  opacity={0.3}
                                  fill={'transparent'}
                            />)}
                    </g>)}
                {Object.entries(data.edges).filter(([keyword]) => selectedKW.includes(keyword))
                    .map(([keyword, edges], i) =>
                        <g key={`${keyword}_${i}`} className={'kwhighlights'}>
                            {edges.map((edge) => edge.filter(({pid}) => !data.papers[pid].hidden).map(({x, pid}) =>
                                <rect
                                    key={pid + keyword}
                                    x={x + data.papers[pid].layout.x - 10}
                                    y={data.papers[pid].layout.y - params.charHeight / 2}
                                    width={((
                                            data.papers[pid].title.indexOf(" ",
                                                data.papers[pid].kwOffsets[keyword]) + 1 || data.papers[pid].title.length + 1)
                                        - data.papers[pid].kwOffsets[keyword]) * params.charWidth}
                                    height={params.charHeight}
                                    fill={data.keywords[keyword].color}
                                />))}
                        </g>)}
                <g className={'titles'}>
                    {Object.values(data.papers).filter((p) => !p.hidden).map((p) =>
                        <g key={p.bibcode}>
                            <g onClick={(event) => {
                                makeInspectTitle(p.bibcode)(event);
                                logEvent('title_inspect_paper', {
                                    sourcePID: paperID,
                                    targetPID: p.bibcode
                                });
                            }} onContextMenu={makeMenuHandler(p)}>
                                <text
                                    key={p.bibcode}
                                    className={'title'}
                                    x={p.layout.x}
                                    y={p.layout.y + 4}
                                    fontWeight={p.type === 'focus' ? 'bold' : 'normal'}
                                    fill={(p.hasEdge && p.keywords.some((k) => selectedKW.includes(k))) ? "black" : 'gray'}>
                                    ({p.year}) {makeTitle(data, p)}
                                    <tspan className={'citecount'}> {String(p.bibcode) === String(paperID) ?
                                        <tspan style={{
                                            fill: '#f00',
                                            fontWeight: 'bold'
                                        }}>FOCAL</tspan>
                                        :
                                        (expansions.includes(String(p.bibcode)) && <tspan style={{
                                            fill: '#080',
                                            fontWeight: 'bold'
                                        }}>EXPANDED</tspan>)
                                    } &lt;{p.citation_count}&gt; {Array(Math.ceil(Math.log2(1 + p.citation_count / data.maxCitations * 31))).fill("*").join("")}
                                    </tspan>
                                </text>
                            </g>
                            {showExcerpts && p.excerpts && <g>
                                {p.excerpts.map((excerpt, i) =>
                                    <text className={'viz-excerpt'}
                                          key={i}
                                          x={p.layout.x}
                                          y={p.layout.y + params.charHeight + params.excerptLeadPad + params.excerptCharHeight * i}
                                          fill={'#701'}
                                          style={{fontFamily: 'Roboto'}}
                                          onClick={p.excerptsType === 'citedByFocus' ? makeHighlightExcerpt(data.focus, p.bibcode, i) : makeHighlightExcerpt(p.bibcode, data.focus, i)}>
                                        ...{boldExcerptKeywords(excerpt)}
                                    </text>)}
                            </g>}
                        </g>)}
                </g>
            </PanSVG>}
        </div>
        <div style={{width: 200, overflow: 'auto'}} className={'keyword-panel'}>
            <div style={{display: 'flex'}}>
                <input type={'text'} value={kwfilter} onChange={(e) => setKWFilter(e.target.value.toLowerCase())}
                       placeholder={"Search keywords..."} style={{width: '100%', flex: 1}}/>
                <button onClick={() => setKWFilter('')}>&times;</button>
            </div>
            <div>
                Sort by: <a href={"javascript:void(0)"} style={kwSort === 'count' ? {fontWeight: 'bold'} : {}}
                            onClick={() => setKWSort('count')}>Count</a>&nbsp;
                <a href={"javascript:void(0)"} style={kwSort === 'az' ? {fontWeight: 'bold'} : {}}
                   onClick={() => setKWSort('az')}>A/Z</a>&nbsp;
                <a href={"javascript:void(0)"} style={kwSort === 'lines' ? {fontWeight: 'bold'} : {}}
                   onClick={() => setKWSort('lines')}>Lines</a>
            </div>
            <div><a href={"javascript:void(0)"} onClick={() => selectKW([])}>Clear Selection</a></div>
            {data &&
                <ul style={{listStyleType: 'none', paddingLeft: 16}}>
                    {Object.keys(data.keywords).filter((k) => kwfilter.split(" ").some((term) => k.includes(term) || term.includes(k)))
                        .sort((a, b) => {
                            if (selectedKW.includes(a) && !selectedKW.includes(b)) return -1
                            else if (selectedKW.includes(b) && !selectedKW.includes(a)) return 1
                            if (kwSort === 'count') return getKeywordCount(b) - getKeywordCount(a);
                            else if (kwSort === 'az') return a.localeCompare(b);
                            else return getKeywordLineCount(b) - getKeywordLineCount(a);
                        }).map((keyword) =>
                            <li className={selectedKW.includes(keyword) ? 'keyword selected' : 'keyword unselected'}>
                                <a href={'javascript:void(0)'} onClick={
                                    selectedKW.includes(keyword) ?
                                        (event) => {
                                            makeRemoveKeyword(keyword)(event);
                                            logEvent('sidebar_remove_keyword', {
                                                pathname: location.pathname,
                                                sourcePID: paperID,
                                                keyword: keyword
                                            });
                                        }
                                        :
                                        (event) => {
                                            makeAddKeyword(keyword)(event);
                                            logEvent('sidebar_add_keyword', {
                                                pathname: location.pathname,
                                                sourcePID: paperID,
                                                keyword: keyword
                                            });
                                        }
                                } style={selectedKW.includes(keyword) ? {background: data.keywords[keyword].color} : {}}

                                >{getKeywordExample(keyword)}
                                </a> ({getKeywordCount(keyword)}) {getKeywordLineCount(keyword) && "*"}
                            </li>)}
                </ul>}
        </div>
    </div>
}
