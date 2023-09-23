import React, {useEffect, useState} from 'react';
import {useHistory, useLocation} from "react-router-dom";
import SearchPaper from "../components/SearchPaper";
import {logEvent} from "../utils/Utils";

function Home() {
    const history = useHistory();
    const location = useLocation();
    const search = new URLSearchParams(location.search);
    const [query, setQuery] = useState("");
    const [searched, setSearched] = useState(search.get("q"))

    const handleSubmit = (e) => {
        e.preventDefault();
        setSearched(query);
        search.set('q', query)
        history.push(location.pathname + "?" + search)
        logEvent("search_home", {q: query})
        return true;
    }

    useEffect(() => {
        setSearched(search?.get("q"));
        setQuery(search?.get("q") || "");
    }, [location]);

    return <div className={'page'} style={{maxWidth: 800, width: "100%", margin: "24px auto"}}>
        <p>Select a paper to get started.</p>
        <form onSubmit={handleSubmit} style={{marginBottom: 16}}>
            <input
                style={{width: "100%"}}
                name={'search'}
                type={'text'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={"Search by Keywords, Bibcode, or DOI"}
            />
        </form>
        {searched && <SearchPaper/>}
    </div>
}

export default Home;