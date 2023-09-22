import React, {useEffect, useState} from "react";
import Loader from "react-loader-spinner";
import {useLocation} from "react-router-dom";
import Values from "../constants/Values";
import {logEvent, renderAuthors} from "../utils/Utils";

const SourceType = {1: "HTML", 2: "Text", 3: "PDF", 4: "DOC", 5: "PPT", 6: "XLS", 7: "PS"};

function InspectPaper(props) {
    const paperID = props.id || props.match?.params.id;
    const location = useLocation();

    const [paper, setPaper] = useState(null);
    const [citations, setCitations] = useState({});

    const makeFocus = (newTab = false) => () => {
        const vizType = location.pathname.split('/')[1];
        const newLocation = "/" + vizType + "/" + paperID;
        logEvent('inspect_focus', {pid: paper.bibcode, vizType, newTab});
        if (newTab) window.open(newLocation, "_blank");
        else window.location = newLocation; // Hard-reset state
    }

    const boldKeywords = (text) => {
        if (!text) return;
        const keywords = (new URLSearchParams(location.search))?.get("k")?.split(",");
        if (!keywords) return text;
        return text.split(" ").map((word, i) => {
            const keyword = keywords.find((keyword) => word.toLowerCase().match(new RegExp(`^${keyword}`)));
            if (keyword) {
                // return <b key={i} style={{color: props.data?.keywords?.[keyword].color || "black"}}>{word} </b>
                return <b key={i}>{word} </b>
            } else return word + " ";
        })
    }

    useEffect(() => {
        setPaper(null);
        if (paperID && props.data?.papers?.[paperID]) {
            console.log(props.data.papers);
            setPaper(props.data.papers[paperID]);
        }
        logEvent('inspect_paper', {pid: paperID, search: location.search, hash: location.hash});
    }, [paperID, props.data]);

    useEffect(() => {
        if (paper?.CitCon) {
            fetch(Values.API_URL + "/get_paper?n=1000&q=" + Object.keys(paper.CitCon).join(","))
                .then(async (res) => {
                    const result = (await res.json()).result;
                    return setCitations(result.reduce((acc, p) => {
                        acc[p.bibcode] = p;
                        return acc;
                    }, {}))
                });
        }
    }, [paper]);

    useEffect(() => {
        if (location.hash && paper) {
            const anchor = location.hash.slice(1).split('-').slice(0, 2).join('-');
            // console.log(anchor)
            const element = document.getElementById(anchor);
            if (element) element.scrollIntoView();
        }
    }, [paper, location])

    return <div>
        {paper ? <div>
                <p><i>{paper.VFN}</i></p>
                <h3>{paper.title} ({paper.year}) <span style={{fontSize: "0.8em", display: 'inline-block'}}>
                    <a target={"_blank"} href={"https://academic.microsoft.com/paper/" + paper.bibcode} onClick={() => {
                        logEvent('inspect_mag_title_id', {pid: paper.bibcode});
                    }}>ID: {paper.bibcode}</a>
                </span></h3>
                <p>{renderAuthors(paper.author, true)} &mdash; <i>{paper.CC} citations</i></p>
                <button onClick={makeFocus(true)}>Focus This Paper</button>
                <button onClick={() => {
                    logEvent('inspect_mag_button', {pid: paper.bibcode});
                    window.open(`https://ui.adsabs.harvard.edu/abs/${paper.bibcode}/abstract`, "_blank");
                }}>
                    Open in ADS
                </button>
                <h3>Abstract:</h3>
                <p>{boldKeywords(paper.abstract)}</p>
                {/*<h3>Sources:</h3>*/}
                {/*{paper.S ?*/}
                {/*    paper.S.map((s, index) => <p key={index}>*/}
                {/*        <a href={s.U} target={"_blank"} onClick={() => {*/}
                {/*            logEvent('inspect_open_source', {pid: paperID, url: s.U});*/}
                {/*        }}>*/}
                {/*            [{SourceType[s.Ty] || "Other"}] {(new URL(s.U)).hostname}*/}
                {/*        </a>*/}
                {/*    </p>)*/}
                {/*    :*/}
                {/*    <p>(none available)</p>*/}
                {/*}*/}
                {/*<h3>Selected references:</h3>*/}
                {/*{paper.CitCon ?*/}
                {/*    Object.entries(paper.CitCon).map(([pid, excerpts]) => <div className={'excerpt-group'} key={pid}*/}
                {/*                                                               id={`ex-${pid}`}>*/}
                {/*        <a href={`/lanes/${pid}`} target={"_blank"} onClick={() => {*/}
                {/*            logEvent('focus_citcon', {sourcePID: paperID, hash: location.hash, targetPID: pid});*/}
                {/*        }}>*/}
                {/*            {citations[pid] ?*/}
                {/*                <span>({citations[pid].year}) {boldKeywords(citations[pid]?.title)} ({renderAuthors(citations[pid].author)})</span>*/}
                {/*                :*/}
                {/*                <span>[{pid}]</span>*/}
                {/*            }</a>*/}
                {/*        {excerpts.map((excerpt, i) => <p className={'excerpt'} key={i}*/}
                {/*                                         style={location.hash === `#ex-${pid}-${i}` ? {backgroundColor: 'yellow'} : {}}>*/}
                {/*            {boldKeywords(excerpt)}</p>)}*/}
                {/*        <hr/>*/}
                {/*    </div>)*/}
                {/*    :*/}
                {/*    <p>(none available)</p>*/}
                {/*}*/}
            </div>
            :
            <p className={'status working'}>
                <Loader type={'Audio'} color={'orange'} height={16} width={16}/>
                <span>Getting paper...</span>
            </p>
        }
    </div>
}

export default InspectPaper;