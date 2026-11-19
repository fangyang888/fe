import React from 'react';
import { StatusAlert, ALERT_STATUS_MAP, NavBar } from '@meetyou/react-my';

export default function HeaderHeight() {
    return (
        <div style={{ transform: ' matrix(1, 0, 0, 1, 0, 0)', height: '100vh' }}>
            <div
                style={{
                    position: 'fixed',
                    background: '#f2f2f5',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 100,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                }}
            >
                <NavBar />
                <StatusAlert status={ALERT_STATUS_MAP.LOADING} headerHeight='4.4rem' />
            </div>
        </div>
    );
}
