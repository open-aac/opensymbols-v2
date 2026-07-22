import { UserButton } from '@clerk/react-router'

const userButtonAppearance = {
  variables: {
    colorPrimary: 'var(--color-action)',
    colorText: 'var(--color-text)',
    colorTextSecondary: 'var(--color-text-muted)',
    colorBackground: 'var(--color-surface)',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-sans)',
  },
  elements: {
    userButtonTrigger: {
      minWidth: '44px',
      minHeight: '44px',
      padding: '0.25rem',
      borderRadius: '999px',
      border: '2px solid var(--color-border)',
      background: 'var(--color-surface)',
    },
    userButtonAvatarBox: {
      width: '36px',
      height: '36px',
    },
    userButtonPopoverCard: {
      background: 'var(--color-surface)',
      border: '2px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'none',
    },
    userButtonPopoverActionButton: { minHeight: '44px' },
  },
} as const

function AccountIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16">
      <path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

export function ClerkUserControl() {
  return (
    <div className="clerk-user-control">
      <UserButton appearance={userButtonAppearance} showName={false}>
        <UserButton.MenuItems>
          <UserButton.Link href="/account" label="Open Symbols account" labelIcon={<AccountIcon />} />
          <UserButton.Action label="manageAccount" />
          <UserButton.Action label="signOut" />
        </UserButton.MenuItems>
      </UserButton>
    </div>
  )
}
