import React, {useEffect, useState} from "react";
import {useHistory, useLocation} from "react-router-dom";
import {logEvent} from "../utils/Utils";

export function MapFilter(props) {
    const history = useHistory();
    const location = useLocation();
    const search = new URLSearchParams(location.search);

    const menuData = props.menuData;
    const setMenuData = props.setMenuData;

    const [showUnmapped, setShowUnmapped] = useState(search.get('su') !== null ? (search.get('su') === 'true') : false);
    const [showExcerpts, setShowExcerpts] = useState(search.get('se') !== null ? (search.get('se') === 'true') : false);
    const [minCitations, setMinCitations] = useState(parseInt(search.get('mc')) || 0);
    const [getCount, setGetCount] = useState(parseInt(search.get('g')) || 100);
    const [getCountText, setGetCountText] = useState(getCount);

    const makeMenuAction = (fxn) => (e) => fxn(e) || setMenuData(null);

    const focus = (id, newTab = false) => {
        const vizType = location.pathname.split('/')[1];
        const newLocation = "/" + vizType + "/" + id;
        if (newTab) window.open(newLocation, "_blank");
        else window.location = newLocation;
    }

    const reset = () => {
        logEvent('reset', {pathname: location.pathname, search: search});
        window.location = location.pathname;
    }

    useEffect(() => {
        search.set("su", showUnmapped);
        history.push(location.pathname + "?" + search);
        props.setShowUnmapped(showUnmapped);
    }, [showUnmapped]);

    useEffect(() => {
        search.set("se", showExcerpts);
        history.push(location.pathname + "?" + search);
        props.setShowExcerpts(showExcerpts);
    }, [showExcerpts]);

    useEffect(() => {
        search.set("mc", minCitations);
        history.push(location.pathname + "?" + search);
        props.setMinCitations(minCitations);
    }, [minCitations]);

    useEffect(() => {
        search.set("g", getCount);
        history.push(location.pathname + "?" + search);
        props.setGetCount(getCount);
    }, [getCount]);

    // Handle URL navigation
    useEffect(() => {
        const search = new URLSearchParams(location.search);
        setShowUnmapped(search.get('su') !== null ? (search.get('su') === 'true') : false);
        setShowExcerpts(search.get('se') !== null ? (search.get('se') === 'true') : false);
        setMinCitations(parseInt(search.get('mc')) || 0);
        setGetCount(parseInt(search.get('g')) || 100);
        setGetCountText(String(parseInt(search.get('g')) || 100));
    }, [location])

    return <div>
        {menuData && <div id={'context-menu-backdrop'} onClick={() => setMenuData(null)}>
            <div id={'context-menu'} style={{top: menuData.position.y, left: menuData.position.x}}>
                {menuData.selectOneKW &&
                <div className={'context-menu-item'} onClick={(event) => {
                    makeMenuAction(menuData.selectOneKW)(event);
                    logEvent('menu_select_one_keyword', {
                        pathname: location.pathname,
                        targetPID: menuData.pid,
                        keyword: menuData.singleKeyword
                    });
                }}>
                    Select Only This Keyword</div>}
                {menuData.selectKW &&
                <div className={'context-menu-item'} onClick={(event) => {
                    makeMenuAction(menuData.selectKW)(event);
                    logEvent('menu_select_title_keywords', {
                        pathname: location.pathname,
                        targetPID: menuData.pid,
                        keywords: menuData.paperKeywords
                    });
                }}>
                    Select Keywords in Title</div>}

                {menuData.inspect &&
                <div className={'context-menu-item'} onClick={(event) => {
                    makeMenuAction(menuData.inspect)(event);
                    logEvent('menu_inspect_paper', {
                        pathname: location.pathname,
                        targetPID: menuData.pid
                    });
                }}>
                    Inspect this Paper</div>}

                <div className={'context-menu-item'} onClick={(event) => {
                    makeMenuAction(() => focus(menuData.pid, true))(event);
                    logEvent('menu_focus', {
                        pathname: location.pathname,
                        targetPID: menuData.pid
                    });
                }}>
                    Focus this Paper
                </div>

                {menuData.expand &&
                <div className={'context-menu-item'} onClick={(event) => {
                    makeMenuAction(menuData.expand.doExpand)(event);
                    logEvent('menu_expand', {
                        pathname: location.pathname,
                        targetPID: menuData.pid,
                        expand: menuData.expand
                    });
                }}>
                    Expand: {menuData.expand.common} common, {menuData.expand.adds} new</div>}
                {menuData.collapse &&
                <div className={'context-menu-item'} onClick={(event) => {
                    makeMenuAction(menuData.collapse.doCollapse)(event);
                    logEvent('menu_collapse', {
                        pathname: location.pathname,
                        targetPID: menuData.pid,
                        collapse: menuData.collapse
                    });
                }}>
                    Collapse: Remove {menuData.collapse.removes}</div>}
            </div>
        </div>}
        <div id={'map-controls'}>
            <span>
            Show Unmapped:
            <input type={'checkbox'} checked={showUnmapped}
                   onChange={(e) => {
                       setShowUnmapped(e.target.checked);
                       logEvent('change_params', {
                           param: 'su',
                           pathname: location.pathname,
                           search: location.search,
                           newState: e.target.checked
                       });
                   }}/>
                   </span>
            {/*<span>*/}
            {/*Show Excerpts:*/}
            {/*<input type={'checkbox'} checked={showExcerpts}*/}
            {/*       onChange={(e) => {*/}
            {/*           setShowExcerpts(e.target.checked);*/}
            {/*           logEvent('change_params', {*/}
            {/*               param: 'se',*/}
            {/*               pathname: location.pathname,*/}
            {/*               search: location.search,*/}
            {/*               newState: e.target.checked*/}
            {/*           });*/}
            {/*       }}/>*/}
            {/*       </span>*/}
            <span>
                Min Citations:
                <input type={'number'} value={minCitations}
                       onChange={(e) => {
                           setMinCitations(parseInt(e.target.value));
                           logEvent('change_params', {
                               param: 'mc',
                               pathname: location.pathname,
                               search: location.search,
                               newState: e.target.value
                           });
                       }}/>
                       </span>
            <span><form onSubmit={(e) => {
                e.preventDefault();
                setGetCount(getCountText);
                logEvent('change_params', {
                    param: 'g',
                    pathname: location.pathname,
                    search: location.search,
                    newState: getCountText
                });
                return false;
            }}>
                Get Count:
                <input type={'number'} value={getCountText}
                       onChange={(e) => setGetCountText(parseInt(e.target.value))}/>
                <button type={'submit'}>GET</button>
            </form></span>
            <span><button onClick={reset}>RESET</button></span>
        </div>
    </div>
}