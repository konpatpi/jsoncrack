import React from "react";
import type { ModalProps } from "@mantine/core";
import {
  Modal,
  Stack,
  Button,
  Text,
  Anchor,
  Alert,
  Badge,
  Group,
  Divider,
  PasswordInput,
  List,
} from "@mantine/core";
import { FaGithub } from "react-icons/fa6";
import { LuCheck, LuCircleX, LuShieldCheck } from "react-icons/lu";
import useGitHub from "../../../store/useGitHub";

const TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=repo,read:user&description=JSONCrack";

const GITHUB_REPO = "corp-ais/sky-fbb-onboarding-common";

export const GitHubModal = ({ opened, onClose }: ModalProps) => {
  const storedToken = useGitHub(state => state.token);
  const setToken = useGitHub(state => state.setToken);
  const clearToken = useGitHub(state => state.clearToken);

  const [inputValue, setInputValue] = React.useState("");
  const [validating, setValidating] = React.useState(false);
  const [testingRepo, setTestingRepo] = React.useState(false);
  const [validUser, setValidUser] = React.useState<string | null>(null);
  const [repoAccess, setRepoAccess] = React.useState<"ok" | "denied" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const hasToken = Boolean(storedToken);

  const handleClose = () => {
    setInputValue("");
    setValidUser(null);
    setError(null);
    onClose();
  };

  const testRepoAccess = async (token: string) => {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    return res.ok;
  };

  const validateAndSave = async () => {
    const token = inputValue.trim();
    if (!token) return;

    setValidating(true);
    setError(null);
    setValidUser(null);
    setRepoAccess(null);

    try {
      // Step 1: verify token is valid
      const userRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });

      if (!userRes.ok) {
        if (userRes.status === 401) {
          setError("Token ไม่ถูกต้อง หรือหมดอายุแล้ว กรุณาตรวจสอบและลองใหม่อีกครั้ง");
        } else {
          setError(`GitHub API ตอบกลับ: ${userRes.status} ${userRes.statusText}`);
        }
        return;
      }

      const user = await userRes.json();

      // Step 2: verify access to the specific repo
      const hasRepoAccess = await testRepoAccess(token);
      setRepoAccess(hasRepoAccess ? "ok" : "denied");

      if (!hasRepoAccess) {
        setError(
          `Token ไม่มีสิทธิ์เข้าถึง repo "${GITHUB_REPO}"\nกรุณาตรวจสอบ scope หรือขอ invitation จาก repo owner`
        );
        return;
      }

      setToken(token);
      setValidUser(user.login as string);
      setInputValue("");
    } catch {
      setError("ไม่สามารถเชื่อมต่อ GitHub API ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต");
    } finally {
      setValidating(false);
    }
  };

  const handleTestExistingToken = async () => {
    if (!storedToken) return;
    setTestingRepo(true);
    setRepoAccess(null);
    const ok = await testRepoAccess(storedToken);
    setRepoAccess(ok ? "ok" : "denied");
    setTestingRepo(false);
  };

  const handleRemove = () => {
    clearToken();
    setValidUser(null);
    setRepoAccess(null);
    setInputValue("");
    setError(null);
  };

  return (
    <Modal
      title={
        <Group gap="xs">
          <FaGithub size={18} />
          <Text fw={600}>GitHub Configuration</Text>
        </Group>
      }
      opened={opened}
      onClose={handleClose}
      centered
      size="md"
    >
      <Stack gap="md">
        {/* Status badges */}
        <Group>
          <Text size="sm" c="dimmed">Token:</Text>
          {hasToken ? (
            <Badge color="green" leftSection={<LuCheck size={12} />}>บันทึกแล้ว</Badge>
          ) : (
            <Badge color="gray" leftSection={<LuCircleX size={12} />}>ยังไม่มี</Badge>
          )}
          <Text size="sm" c="dimmed">Repo Access:</Text>
          {repoAccess === "ok" ? (
            <Badge color="green" leftSection={<LuCheck size={12} />}>ผ่าน</Badge>
          ) : repoAccess === "denied" ? (
            <Badge color="red" leftSection={<LuCircleX size={12} />}>ไม่มีสิทธิ์</Badge>
          ) : (
            <Badge color="gray">ยังไม่ทดสอบ</Badge>
          )}
        </Group>

        {/* Success state */}
        {validUser && (
          <Alert color="green" icon={<LuCheck />} title="ตั้งค่าสำเร็จ">
            {`ยืนยันตัวตน: @${validUser} — มีสิทธิ์เข้าถึง repo สำเร็จ`}
          </Alert>
        )}

        {/* Error */}
        {error && (
          <Alert color="red" icon={<LuCircleX />} title="เกิดข้อผิดพลาด">
            <Text size="xs" style={{ whiteSpace: "pre-line" }}>{error}</Text>
          </Alert>
        )}

        <Divider />

        {/* How to generate token */}
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            วิธีสร้าง Personal Access Token
          </Text>
          <List size="sm" spacing="xs">
            <List.Item>
              ไปที่{" "}
              <Anchor href={TOKEN_URL} target="_blank" rel="noopener" size="sm">
                GitHub → Settings → Tokens (classic)
              </Anchor>
            </List.Item>
            <List.Item>เลือก scope: <strong>repo</strong> (เข้าถึง private repo ได้)</List.Item>
            <List.Item>คลิก Generate token แล้ว copy มาใส่ด้านล่าง</List.Item>
          </List>
        </Stack>

        {/* Token input */}
        <PasswordInput
          label="Personal Access Token"
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          value={inputValue}
          onChange={e => { setInputValue(e.currentTarget.value); setError(null); }}
          onKeyDown={e => {
            if (e.key === "Enter") validateAndSave();
          }}
          disabled={validating}
          data-autofocus
        />

        {/* Security note */}
        <Alert color="blue" icon={<LuShieldCheck />} title="ความปลอดภัย">
          <Text size="xs">
            Token ถูกเก็บใน <strong>localStorage</strong> เท่านั้น ไม่ส่งไปยัง server ใดๆ
          </Text>
        </Alert>

        {/* Actions */}
        <Group justify="space-between">
          {hasToken && (
            <Button variant="subtle" color="red" onClick={handleRemove} size="sm">
              ลบ Token ออก
            </Button>
          )}
          <Group ml="auto">
            {hasToken && !inputValue && (
              <Button
                variant="light"
                color="teal"
                size="sm"
                loading={testingRepo}
                onClick={handleTestExistingToken}
              >
                ทดสอบ Repo Access
              </Button>
            )}
            <Button variant="default" onClick={handleClose} size="sm">
              ปิด
            </Button>
            <Button
              onClick={validateAndSave}
              loading={validating}
              disabled={!inputValue.trim()}
              size="sm"
            >
              ตรวจสอบและบันทึก
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
};
