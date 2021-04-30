import React from "react";
import {useHistory} from "react-router-dom";

export default function About() {
    const history = useHistory();

    return <div className={'article'}>
        <h1>About PaperMaps</h1>
        <p>This is <a href={"https://george.moe"}>George Moe's</a> senior thesis.</p>
        <p><a href={"javascript:void(0)"} onClick={history.goBack}>Go Back</a></p>
    </div>
}