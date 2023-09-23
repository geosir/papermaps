import React, {useEffect, useMemo, useState} from "react";
import {useHistory, useLocation} from "react-router-dom";
import {logEvent} from "../utils/Utils";

// Components
import DynamicLanesViz from "./DynamicLanesViz";

// Style
import "../assets/css/Map.css";
import "../assets/css/Visualization.css";

export default function Map(props) {
    const history = useHistory();
    const location = useLocation();
    const search = new URLSearchParams(location.search);
    const [query, setQuery] = useState(search.get("q"));

    const [showSearch, setShowSearch] = useState(true)

    const handleSubmit = (e) => {
        e.preventDefault();
        search.set('q', query)
        history.push(location.pathname + "?" + search);
        logEvent("search_map", {q: query})
        return true;
    }

    useEffect(() => {
        setQuery(search?.get("q") || "");
    }, [location]);

    // Rendering
    const Visualization = useMemo(() => {
        return <DynamicLanesViz {...props} setShowSearch={setShowSearch}/>
    }, []);

    return <div id={'app'}>
        {showSearch && <div id={'map-search'}>
            <form onSubmit={handleSubmit}>
                <input
                    id={'search'}
                    className={'above-panel'}
                    name={'search'}
                    type={'text'}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={"Search by Keywords, BibCode, or DOI"}
                />
            </form>
        </div>}

        <div id={'body'}>
            {Visualization}

            {/*<div style={{textAlign: 'right', position: 'absolute', bottom: 16, right: 16, opacity: 0.5}}>*/}
            {/*    <p style={{margin: 0, fontSize: 16}}>Session ID: {window.papermapsSessionID}</p>*/}
            {/*</div>*/}
            {/*<div style={{textAlign: 'right', position: 'absolute', bottom: 40, right: 16, opacity: 0.5}}>*/}
            {/*    <h1 style={{margin: 0, color: '#254fff'}}>PaperMaps</h1>*/}
            {/*    <p style={{marginTop: -2, marginBottom: 0, fontSize: 12}}>*/}
            {/*        George Moe {(new Date()).getFullYear()}</p>*/}
            {/*</div>*/}
            {/*<div id={'map-swit
            */}
        </div>
    </div>
}