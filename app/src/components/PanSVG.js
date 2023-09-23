import React, {useEffect, useState, useRef} from "react";
import {TransformComponent, TransformWrapper} from "react-zoom-pan-pinch";
import {getViewBox} from "../utils/Common";

export function PanSVG(props) {
    const container = useRef();
    // const [step, setStep] = useState(150);
    // useEffect(() => {
    //     // TODO: For some reason, wheel step has different results depending on the width of the container relative to the
    //     //  full window width. Seems to only happen in firefox. Hacky solution is to respond to it. But why does this happen?
    //     if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1) {
    //         setStep(container.current?.offsetWidth === window.innerWidth ? 150 : 6.5);
    //     }
    // })

    return <div ref={container} style={{flex: 1, overflow: 'hidden'}}>
        <TransformWrapper doubleClick={{disabled: true}} options={{maxScale: 100}}
                          wheel={{step: 6.5}} // wheel={{step: step}}
            // onZoomChange={({scale}) => props.setScale && props.setScale(scale)}
            // onPanning={() => props.setPanning && props.setPanning(true)}
            // onPanningStop={() => props.setPanning && props.setPanning(false)}>
        >
            <TransformComponent>
                <svg id={'papermap'}
                     viewBox={getViewBox(props.maxDims)}
                     style={{
                         width: container.current?.offsetWidth,
                         height: '100vh',
                         cursor: 'grab', margin: 0
                     }}>
                    {props.children}
                </svg>
            </TransformComponent>
        </TransformWrapper>
    </div>
}