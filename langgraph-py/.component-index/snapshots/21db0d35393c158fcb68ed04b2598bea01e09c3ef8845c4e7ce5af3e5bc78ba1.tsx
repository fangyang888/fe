import React, { useRef } from 'react';
import { NavBar } from '@meetyou/react-my';

export default function Scroll() {
    const contentRef = useRef(null);

    return (
        <div style={{ background: '#E9F2FF' }}>
            <NavBar type='gradient' scrollRef={contentRef}>
                渐变导航交互
            </NavBar>
            <div ref={contentRef} style={{ height: '300px', overflow: 'auto' }}>
                <div style={{ height: '8px', backgroundColor: '#f2f2f5' }} />
                <div style={{ height: '1500px', padding: '8px' }}>content</div>
            </div>
        </div>
    );
}
