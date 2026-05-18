ALTER TABLE `users`
  DROP INDEX `username`,
  ADD KEY `idx_users_username` (`username`);
