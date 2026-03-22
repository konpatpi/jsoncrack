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

  // Pre-fill token when modal opens if one is already saved
  React.useEffect(() => {
    if (opened && storedToken) {
      setInputValue(storedToken);
    }
  }, [opened, storedToken]);

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
          setError("Token is invalid or has expired. Please check and try again.");
        } else {
          setError(`GitHub API responded: ${userRes.status} ${userRes.statusText}`);
        }
        return;
      }

      const user = await userRes.json();

      // Step 2: verify access to the specific repo
      const hasRepoAccess = await testRepoAccess(token);
      setRepoAccess(hasRepoAccess ? "ok" : "denied");

      if (!hasRepoAccess) {
        setError(
          `Token does not have access to repo "${GITHUB_REPO}".\nPlease check the token scope or request an invitation from the repo owner.`
        );
        return;
      }

      setToken(token);
      setValidUser(user.login as string);
      // keep input populated so user can see their saved token
    } catch {
      setError("Unable to connect to GitHub API. Please check your internet connection.");
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
            <Badge color="green" leftSection={<LuCheck size={12} />}>Saved</Badge>
          ) : (
            <Badge color="gray" leftSection={<LuCircleX size={12} />}>Not set</Badge>
          )}
          <Text size="sm" c="dimmed">Repo Access:</Text>
          {repoAccess === "ok" ? (
            <Badge color="green" leftSection={<LuCheck size={12} />}>Granted</Badge>
          ) : repoAccess === "denied" ? (
            <Badge color="red" leftSection={<LuCircleX size={12} />}>Denied</Badge>
          ) : (
            <Badge color="gray">Not tested</Badge>
          )}
        </Group>

        {/* Success state */}
        {validUser && (
          <Alert color="green" icon={<LuCheck />} title="Token saved">
            {`Authenticated as @${validUser} — repo access granted.`}
          </Alert>
        )}

        {/* Error */}
        {error && (
          <Alert color="red" icon={<LuCircleX />} title="Error">
            <Text size="xs" style={{ whiteSpace: "pre-line" }}>{error}</Text>
          </Alert>
        )}

        <Divider />

        {/* How to generate token */}
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            How to generate a Personal Access Token
          </Text>
          <List size="sm" spacing="xs">
            <List.Item>
              Go to{" "}
              <Anchor href={TOKEN_URL} target="_blank" rel="noopener" size="sm">
                GitHub &rarr; Settings &rarr; Tokens (classic)
              </Anchor>
            </List.Item>
            <List.Item>Select scope: <strong>repo</strong> (access private repos)</List.Item>
            <List.Item>Click Generate token and paste it below.</List.Item>
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
        <Alert color="blue" icon={<LuShieldCheck />} title="Security">
          <Text size="xs">
            Your token is stored in <strong>localStorage</strong> only and never sent to any server.
          </Text>
        </Alert>

        {/* Actions */}
        <Group justify="space-between">
          {hasToken && (
            <Button variant="subtle" color="red" onClick={handleRemove} size="sm">
              Remove Token
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
                Test Repo Access
              </Button>
            )}
            <Button variant="default" onClick={handleClose} size="sm">
              Close
            </Button>
            <Button
              onClick={validateAndSave}
              loading={validating}
              disabled={!inputValue.trim()}
              size="sm"
            >
              Verify &amp; Save
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
};
