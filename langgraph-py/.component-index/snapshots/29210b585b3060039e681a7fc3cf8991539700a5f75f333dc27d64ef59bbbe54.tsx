import React from 'react';
import { Button } from '@meetyou/react-components';
import { Row, Col } from 'antd';

export default () => {
    return (
        <Row gutter={[8, 8]}>
            <Col>
                <Button type='primary' plain ghost width={120}>
                    Primary
                </Button>
            </Col>
        </Row>
    );
};
