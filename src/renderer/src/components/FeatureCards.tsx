import { Card, Button, Row, Col, Typography, Space } from 'antd'
import { AudioOutlined, UploadOutlined, FontSizeOutlined } from '@ant-design/icons'

const { Text } = Typography

interface FeatureCardsProps {
  onUpload: () => void
  onRecord: () => void
  streamingModelAvailable: boolean
}

export function FeatureCards({ onUpload, onRecord, streamingModelAvailable }: FeatureCardsProps) {
  return (
    <Row gutter={16}>
      <Col span={8}>
        <Card style={{ height: '100%' }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space>
              <AudioOutlined style={{ fontSize: 24 }} />
              <Text strong>实时录音</Text>
            </Space>
            <Text type="secondary">实时语音转文字，支持区分说话人</Text>
            <Button block disabled={!streamingModelAvailable} onClick={onRecord}>
              {streamingModelAvailable ? '开始录音' : '需要下载流式模型'}
            </Button>
          </Space>
        </Card>
      </Col>
      <Col span={8}>
        <Card style={{ height: '100%' }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space>
              <UploadOutlined style={{ fontSize: 24 }} />
              <Text strong>上传音视频</Text>
            </Space>
            <Text type="secondary">支持音视频文件转文字，结果可导出</Text>
            <Button type="primary" block onClick={onUpload}>立即上传</Button>
          </Space>
        </Card>
      </Col>
      <Col span={8}>
        <Card style={{ height: '100%' }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space>
              <FontSizeOutlined style={{ fontSize: 24 }} />
              <Text strong>实时字幕</Text>
            </Space>
            <Text type="secondary">实时生成字幕记录，配合音视频播放</Text>
            <Button block disabled>即将推出</Button>
          </Space>
        </Card>
      </Col>
    </Row>
  )
}
