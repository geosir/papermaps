import React, {useEffect, useState} from "react";
import {useHistory, useLocation} from "react-router-dom";
import {logEvent, renderAuthors} from "../utils/Utils";
import Values from "../constants/Values";

// Components
import Loader from "react-loader-spinner";

// Style
import "../assets/css/SelectPaper.css";

const makeExpand = (id, location) => () => {
    const search = new URLSearchParams(location.search);
    const expansions = search.get('e')?.split(',') || [];
    if (!expansions.includes(String(id))) {
        expansions.push(id);
        search.delete('q');
        search.set('e', expansions.join(','));
        window.location = location.pathname + "?" + search;
    }
}

const makePaperItemRenderer = (next, location, history) => (e) => <div className={'search-result'} key={e.bibcode}>
    <a href={(next ? next : "/lanes/") + e.bibcode} onClick={() => logEvent('search_select', {pid: e.bibcode})}>
        <p className={'search-title'}><b>({e.year}) {e.title}</b></p>
    </a>
    <p className={'search-authors'}><i>{renderAuthors(e.author)}</i></p>
    <p className={'search-detail'}>
        <span className={'search-expand'}>
            <a href={"javascript:void(0)"} onClick={(event) => {
                makeExpand(e.bibcode, location, history)(event);
                logEvent('search_expand', {pid: e.bibcode})
            }}>Add to Map</a>
        </span> &mdash; <span className={'search-id'}>
        <a target={"_blank"} href={`https://ui.adsabs.harvard.edu/abs/${e.bibcode}/abstract`}
           onClick={() => logEvent('search_mag', {pid: e.bibcode})}>
            Bibcode: {e.bibcode}</a></span> &mdash; <span className={'search-citations'}>cited {e.citation_count} times</span>
    </p>
</div>;


function SearchPaper() {
    const history = useHistory();
    const location = useLocation();
    const search = new URLSearchParams(location.search);
    const query = search.get('q') || null;
    const next = search.get('next');

    const [papers, setPapers] = useState(null);
    const [working, setWorking] = useState(false);

    const clearSearch = (e) => {
        e.preventDefault();
        search.delete('q')
        history.push(location.pathname + "?" + search);
        logEvent("search_clear", {});
        return true;
    }

    useEffect(() => {
        if (query) {
            setWorking(true);
            fetch(Values.API_URL + "/get_paper?q=" + query)
                .then(async (res) => setPapers(await res.json()))
                .finally(() => setWorking(false));
            logEvent('search', {query: query});
        }
    }, [location]);

    return <div>
        <button onClick={clearSearch}>Clear Search</button>
        {Boolean(working) && <p className={'status working'}>
            <Loader type={'Audio'} color={'orange'} height={16} width={16}/>
            Searching...
        </p>}
        {papers && <div className={'papers'}>
            {papers.status === 'success' ? papers.result.map(makePaperItemRenderer(next, location, history)) :
                <pre style={{border: '1px solid black', marginTop: 12, backgroundColor: 'lightgray', padding: 12}}>
                    {JSON.stringify(papers, null, 4)}
                </pre>}
        </div>}
    </div>
}

export default SearchPaper;