"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { KeyRound, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// A user row from GET /api/users. password_hash is never exposed by the API.
export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: "COLLECTOR" | "OPERATOR";
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
}

// SWR fetcher — throws on non-2xx so isLoading/error behave predictably.
async function fetcher(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message ?? "Failed to load users");
  }
  return response.json() as Promise<AppUser[]>;
}

// Filter pills mirroring the roles the Owner can manage (no OWNER here).
const ROLE_FILTERS = [
  { value: "all", label: "All" },
  { value: "COLLECTOR", label: "Collectors" },
  { value: "OPERATOR", label: "Operators" },
] as const;

const FIELD =
  "h-10 rounded-lg border-input bg-white px-3 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20";

const EMPTY_FORM: {
  name: string;
  email: string;
  password: string;
  role: AppUser["role"];
} = { name: "", email: "", password: "", role: "COLLECTOR" };

function formatDate(value: string) {
  // created_at arrives as an ISO timestamp; show just the calendar date.
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Gold pill for Operator, charcoal for Collector — matches the mockup.
function RoleBadge({ role }: { role: AppUser["role"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        role === "OPERATOR"
          ? "border-gold bg-gold/15 text-charcoal"
          : "border-charcoal/20 bg-charcoal text-cream"
      )}
    >
      {role === "OPERATOR" ? "Operator" : "Collector"}
    </Badge>
  );
}

// Status shown as a colored dot + label (green for active, muted for inactive).
function StatusCell({ status }: { status: AppUser["status"] }) {
  const active = status === "ACTIVE";
  return (
    <span className="inline-flex items-center gap-2 text-sm text-charcoal">
      <span
        className={cn(
          "size-2 rounded-full",
          active ? "bg-green-600" : "bg-muted-foreground/50"
        )}
        aria-hidden
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}
export function UsersClient() {
  const [role, setRole] = useState<string>("all");

  // Add-user dialog state.
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit-name dialog state.
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [editName, setEditName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  // Reset-password dialog state.
  const [resetUser, setResetUser] = useState<AppUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Which row's Activate/Deactivate button is busy right now.
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);

  const query = new URLSearchParams();
  if (role !== "all") query.set("role", role);

  const { data, error, isLoading, mutate } = useSWR<AppUser[]>(
    `/api/users?${query.toString()}`,
    fetcher,
    { refreshInterval: 15000, keepPreviousData: true }
  );

  // POST the new user, then refresh the list.
  async function handleAddUser(event: FormEvent) {
    event.preventDefault();
    if (
      form.name.trim() === "" ||
      form.email.trim() === "" ||
      form.password === ""
    ) {
      toast.error("Name, email and password are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.message ?? "Could not create the user.");
        return;
      }
      toast.success(`User "${payload.name}" created.`);
      setAddOpen(false);
      setForm(EMPTY_FORM);
      mutate();
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function openEdit(user: AppUser) {
    setEditUser(user);
    setEditName(user.name);
  }

  function openReset(user: AppUser) {
    setResetUser(user);
    setNewPassword("");
  }

  // PATCH a new password for the selected user.
  async function handleResetPassword(event: FormEvent) {
    event.preventDefault();
    if (!resetUser) return;
    if (newPassword === "") {
      toast.error("A new password is required.");
      return;
    }

    setIsSavingPassword(true);
    try {
      const response = await fetch(`/api/users/${resetUser.id}/reset-password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.message ?? "Could not reset the password.");
        return;
      }
      toast.success(
        `Password reset for "${resetUser.name}" — share the new password with them directly.`
      );
      setResetUser(null);
      setNewPassword("");
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
    } finally {
      setIsSavingPassword(false);
    }
  }

  // PATCH name only — role and email stay read-only for the MVP.
  async function handleEditName(event: FormEvent) {
    event.preventDefault();
    if (!editUser) return;
    if (editName.trim() === "") {
      toast.error("Name can't be empty.");
      return;
    }

    setIsSavingName(true);
    try {
      const response = await fetch(`/api/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.message ?? "Could not save the name.");
        return;
      }
      toast.success("Name updated.");
      setEditUser(null);
      mutate();
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
    } finally {
      setIsSavingName(false);
    }
  }

  // PATCH status to ACTIVE/INACTIVE.
  async function toggleStatus(user: AppUser) {
    const nextStatus = user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setStatusBusyId(user.id);
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.message ?? "Could not update the user.");
        return;
      }
      toast.success(
        nextStatus === "INACTIVE"
          ? `"${user.name}" deactivated — they can no longer sign in.`
          : `"${user.name}" is active again.`
      );
      mutate();
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
    } finally {
      setStatusBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header + Add user */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight text-charcoal md:text-4xl">
            Users
          </h1>
          <p className="text-sm text-muted-foreground">
            Create and manage the team members who use the system.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setAddOpen(true)}
          className="h-11 shrink-0 rounded-lg bg-gold px-6 text-sm font-semibold text-charcoal shadow-sm transition-all hover:bg-gold/90 active:scale-[0.99]"
        >
          <Plus className="size-4" aria-hidden />
          Add user
        </Button>
      </header>

      {/* Filter pills */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-white p-4 shadow-sm md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Role
          </Label>
          <div className="flex flex-wrap gap-2">
            {ROLE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setRole(filter.value)}
                aria-pressed={role === filter.value}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                  role === filter.value
                    ? "border-gold bg-gold text-charcoal"
                    : "border-border bg-white text-muted-foreground hover:border-gold hover:text-charcoal"
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row count */}
      <p className="text-sm text-muted-foreground">
        {isLoading ? "Loading…" : `${data?.length ?? 0} users`}
      </p>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-rust/30 bg-rust/10 px-6 py-4 text-sm text-rust">
          {error.message}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3 rounded-xl border border-border bg-white p-6 shadow-sm">
          <Skeleton className="h-8 w-full" />
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && (data?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-white/60 px-6 py-12 text-center text-sm text-muted-foreground">
          {role !== "all"
            ? "No users match the current filter."
            : "No users yet. Add your first collector or operator."}
        </div>
      )}

      {/* Users table */}
      {!isLoading && !error && (data?.length ?? 0) > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="h-11 pl-6 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Name
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Email
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Role
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Status
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Date added
                </TableHead>
                <TableHead className="h-11 pr-6 text-right text-xs font-semibold uppercase tracking-wider text-charcoal">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((user) => (
                <TableRow key={user.id} className="hover:bg-gold/6">
                  <TableCell className="py-3.5 pl-6 text-sm font-medium text-charcoal">
                    {user.name}
                  </TableCell>
                  <TableCell className="py-3.5 text-sm text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell className="py-3.5">
                    <RoleBadge role={user.role} />
                  </TableCell>
                  <TableCell className="py-3.5">
                    <StatusCell status={user.status} />
                  </TableCell>
                  <TableCell className="py-3.5 text-sm text-muted-foreground">
                    {formatDate(user.createdAt)}
                  </TableCell>
                  <TableCell className="py-3.5 pr-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(user)}
                        className="h-8 rounded-lg border border-border bg-white px-3 text-xs font-medium text-charcoal transition-colors hover:border-gold hover:bg-gold/5"
                      >
                        <Pencil className="size-3.5" aria-hidden />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openReset(user)}
                        className="h-8 rounded-lg border border-border bg-white px-3 text-xs font-medium text-charcoal transition-colors hover:border-gold hover:bg-gold/5"
                      >
                        <KeyRound className="size-3.5" aria-hidden />
                        Reset password
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleStatus(user)}
                        disabled={statusBusyId === user.id}
                        className={cn(
                          "h-8 rounded-lg border border-border bg-white px-3 text-xs font-medium transition-colors",
                          user.status === "ACTIVE"
                            ? "text-rust hover:border-rust/40 hover:bg-rust/5"
                            : "text-charcoal hover:border-green-600/40 hover:bg-green-600/5"
                        )}
                      >
                        {statusBusyId === user.id
                          ? "Saving…"
                          : user.status === "ACTIVE"
                            ? "Deactivate"
                            : "Activate"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add user dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md gap-0 rounded-xl p-0 ring-border sm:max-w-md">
          <div className="border-b border-border bg-cream px-6 py-4">
            <DialogHeader className="gap-1 text-left">
              <DialogTitle className="text-base font-semibold text-charcoal">
                Add user
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Create a Collector or Operator account for a team member.
              </DialogDescription>
            </DialogHeader>
          </div>

          <form onSubmit={handleAddUser}>
            <div className="space-y-4 px-6 py-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-user-name" className="text-sm font-semibold text-charcoal">
                  Name
                </Label>
                <Input
                  id="new-user-name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="e.g. Karim Hossain"
                  required
                  className={FIELD}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="new-user-email" className="text-sm font-semibold text-charcoal">
                  Email
                </Label>
                <Input
                  id="new-user-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="e.g. karim@jamilcreations.com"
                  required
                  className={FIELD}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="new-user-password" className="text-sm font-semibold text-charcoal">
                  Password
                </Label>
                <PasswordInput
                  id="new-user-password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  placeholder="Temporary password"
                  autoComplete="new-password"
                  required
                  className={FIELD}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-sm font-semibold text-charcoal">Role</Label>
                <Select
                  value={form.role}
                  onValueChange={(value) =>
                    setForm({ ...form, role: value as AppUser["role"] })
                  }
                >
                  <SelectTrigger
                    aria-label="Role"
                    className="h-10 w-full rounded-lg border-input bg-white px-3 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COLLECTOR">Collector</SelectItem>
                    <SelectItem value="OPERATOR">Operator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="gap-3 border-t border-border bg-cream/60 px-6 py-3.5 sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAddOpen(false)}
                disabled={isSubmitting}
                className="h-9 rounded-lg text-sm font-medium text-muted-foreground hover:text-charcoal"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-9 rounded-lg bg-gold px-6 text-sm font-semibold text-charcoal shadow-sm transition-all hover:bg-gold/90 active:scale-[0.99] disabled:opacity-50"
              >
                {isSubmitting ? "Creating…" : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit name dialog */}
      <Dialog
        open={editUser !== null}
        onOpenChange={(open) => {
          if (!open) setEditUser(null);
        }}
      >
        <DialogContent className="max-w-md gap-0 rounded-xl p-0 ring-border sm:max-w-md">
          <div className="border-b border-border bg-cream px-6 py-4">
            <DialogHeader className="gap-1 text-left">
              <DialogTitle className="text-base font-semibold text-charcoal">
                Edit user
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Update the display name. Email and role are fixed for the MVP.
              </DialogDescription>
            </DialogHeader>
          </div>

          <form onSubmit={handleEditName}>
            <div className="space-y-4 px-6 py-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-user-name" className="text-sm font-semibold text-charcoal">
                  Name
                </Label>
                <Input
                  id="edit-user-name"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  placeholder="e.g. Karim Hossain"
                  required
                  autoFocus
                  className={FIELD}
                />
              </div>
            </div>

            <DialogFooter className="gap-3 border-t border-border bg-cream/60 px-6 py-3.5 sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditUser(null)}
                disabled={isSavingName}
                className="h-9 rounded-lg text-sm font-medium text-muted-foreground hover:text-charcoal"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSavingName || editName.trim() === ""}
                className="h-9 rounded-lg bg-charcoal px-6 text-sm font-semibold text-cream shadow-sm transition-all hover:bg-charcoal/85 active:scale-[0.99] disabled:opacity-50"
              >
                {isSavingName ? "Saving…" : "Save name"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog
        open={resetUser !== null}
        onOpenChange={(open) => {
          if (!open) setResetUser(null);
        }}
      >
        <DialogContent className="max-w-md gap-0 rounded-xl p-0 ring-border sm:max-w-md">
          <div className="border-b border-border bg-cream px-6 py-4">
            <DialogHeader className="gap-1 text-left">
              <DialogTitle className="text-base font-semibold text-charcoal">
                Reset password
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Set a new password for {resetUser?.name ?? "this user"}. There is
                no email flow — give them the new password directly.
              </DialogDescription>
            </DialogHeader>
          </div>

          <form onSubmit={handleResetPassword}>
            <div className="space-y-4 px-6 py-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="reset-user-password" className="text-sm font-semibold text-charcoal">
                  New password
                </Label>
                <PasswordInput
                  id="reset-user-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="New password"
                  autoComplete="new-password"
                  required
                  autoFocus
                  className={FIELD}
                />
              </div>
            </div>

            <DialogFooter className="gap-3 border-t border-border bg-cream/60 px-6 py-3.5 sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setResetUser(null)}
                disabled={isSavingPassword}
                className="h-9 rounded-lg text-sm font-medium text-muted-foreground hover:text-charcoal"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSavingPassword || newPassword === ""}
                className="h-9 rounded-lg bg-charcoal px-6 text-sm font-semibold text-cream shadow-sm transition-all hover:bg-charcoal/85 active:scale-[0.99] disabled:opacity-50"
              >
                {isSavingPassword ? "Saving…" : "Reset password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}