import React, {useEffect} from "react";
import {useLocation} from "react-router-dom";
import {logEvent} from "../utils/Utils";

export default function LocationListener(props) {
    const location = useLocation();

    useEffect(() => {
        logEvent('location', {
            pathname: location.pathname,
            search: location.search,
            hash: location.hash,
        });
    }, [location])
    return null;
}