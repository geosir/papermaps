import React from 'react';
import {BrowserRouter as Router, Switch, Route, Link} from "react-router-dom";

// Pages
import Map from "./pages/Map";
import About from "./pages/About";
import Home from "./pages/Home";

// Style
import './App.css';
import LocationListener from "./components/LocationListener";
import {logEvent} from "./utils/Utils";

function App() {

    // Set unique session ID
    const timestamp = String(Math.floor(Date.now() / 1000) - 1613883600);
    const randomSalt = String(Math.floor(Math.random() * 1e3)).padStart(3, '0');
    window.papermapsSessionID = `${timestamp}_${randomSalt}`;
    console.log("SESSION ID:", window.papermapsSessionID);
    logEvent("new_session", {
        userAgent: navigator.userAgent || navigator.vendor || window.opera,
        windowHeight: window.innerHeight,
        windowWidth: window.innerWidth,
        touchscreen: (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0))
    })

    return (
        <Router>
            <LocationListener/>
            <Switch>
                <Route path={"/about"} exact component={About}/>
                <Route path={"/lanes/:id"} component={Map}/>
                <Route path={"/"} exact component={Home}/>
                <Route>
                    <div style={{
                        display: 'flex',
                        textAlign: 'center',
                        width: '100%',
                        flexDirection: 'column',
                        justifyContent: 'center'
                    }}>
                        <h1>Not Found</h1>
                        <p><Link to={"/"}>go back home</Link></p>
                    </div>
                </Route>
            </Switch>
        </Router>
    );
}

export default App;
