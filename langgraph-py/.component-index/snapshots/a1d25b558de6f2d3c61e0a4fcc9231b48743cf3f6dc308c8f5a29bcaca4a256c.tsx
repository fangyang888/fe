import React, { useRef, useState } from 'react';
import { NavBar } from '@meetyou/react-my';

export default () => {
    const [opacity, setOpacity] = useState(0);
    const contentRef = useRef(null);

    return (
        <div style={{ background: '#E9F2FF', position: 'relative' }}>
            <NavBar
                scrollRef={contentRef}
                onOpacityChange={val => setOpacity(val || 0)}
                type='gradient'
            >
                导航栏渐变回调事件
            </NavBar>
            <div ref={contentRef} style={{ height: '100px', overflow: 'auto' }}>
                <div style={{ height: '8px', backgroundColor: '#f2f2f5' }} />
                <div style={{ height: '1500px', padding: '8px' }}>
                    <span style={{ position: 'absolute', top: '70px' }}>
                        opacity可见度： {opacity}
                    </span>
                </div>
            </div>
        </div>
    );
};
