import React, { useRef, useMemo } from 'react';
import { NavBar } from '@meetyou/react-my';

export default function Scroll() {
    const contentRef = useRef(null);

    const footerNode = useMemo(() => {
        return (
            <div
                className='footer-tab'
                style={{
                    height: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <div>tab1</div>
                <div>tab2</div>
                <div>tab3</div>
            </div>
        );
    }, []);

    return (
        <div style={{ background: '#E9F2FF' }}>
            <NavBar
                type='gradient'
                scrollRef={contentRef}
                titleGradidentShow={true}
                footer={footerNode}
                gradidentFooterLine={true}
            >
                自定义导航底部
            </NavBar>
            <div ref={contentRef} style={{ height: '300px', overflow: 'auto' }}>
                <div style={{ height: '8px', backgroundColor: '#f2f2f5' }} />
                <div style={{ height: '1500px', padding: '8px' }}>content</div>
            </div>
        </div>
    );
}
