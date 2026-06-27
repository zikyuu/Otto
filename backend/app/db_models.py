"""SQLAlchemy ORM models — persisted layer mapping to app/models.py dataclasses.

Tables:
  profiles, skills, walls, goals, goal_required_skills,
  tasks, task_prereqs, plans, blocks, completion_events
"""
from __future__ import annotations

import uuid

from sqlalchemy import (
    Boolean, Column, Float, ForeignKey, Integer, String, Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.types import TIMESTAMP

from app.database import Base


def _uuid():
    return str(uuid.uuid4())


class ProfileRow(Base):
    __tablename__ = "profiles"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    session_id = Column(String, index=True, nullable=True)
    free_hours_per_day = Column(Float, nullable=False, default=3.0)
    velocity = Column(Float, nullable=False, default=0.8)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    skills = relationship("SkillRow", back_populates="profile", cascade="all, delete-orphan")
    walls = relationship("WallRow", back_populates="profile", cascade="all, delete-orphan")
    goals = relationship("GoalRow", back_populates="profile", cascade="all, delete-orphan")
    plans = relationship("PlanRow", back_populates="profile", cascade="all, delete-orphan")


class SkillRow(Base):
    __tablename__ = "skills"

    id = Column(String, primary_key=True)
    profile_id = Column(UUID(as_uuid=False), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    proficiency = Column(Integer, nullable=False, default=0)

    profile = relationship("ProfileRow", back_populates="skills")


class WallRow(Base):
    __tablename__ = "walls"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    profile_id = Column(UUID(as_uuid=False), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    day = Column(Integer, nullable=False)
    start_min = Column(Integer, nullable=False)
    end_min = Column(Integer, nullable=False)
    label = Column(String, default="")

    profile = relationship("ProfileRow", back_populates="walls")


class GoalRow(Base):
    __tablename__ = "goals"

    id = Column(String, primary_key=True)
    profile_id = Column(UUID(as_uuid=False), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=True)
    title = Column(Text, nullable=False)
    jd_text = Column(Text, default="")
    close_date = Column(String, default="")
    fit = Column(Float, default=0.5)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    profile = relationship("ProfileRow", back_populates="goals")
    required_skills = relationship("GoalSkillRow", back_populates="goal", cascade="all, delete-orphan")
    tasks = relationship("TaskRow", back_populates="goal", cascade="all, delete-orphan")


class GoalSkillRow(Base):
    __tablename__ = "goal_required_skills"
    __table_args__ = (UniqueConstraint("goal_id", "skill_name"),)

    goal_id = Column(String, ForeignKey("goals.id", ondelete="CASCADE"), primary_key=True)
    skill_name = Column(String, primary_key=True)

    goal = relationship("GoalRow", back_populates="required_skills")


class TaskRow(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True)
    goal_id = Column(String, ForeignKey("goals.id", ondelete="CASCADE"), nullable=False)
    title = Column(Text, nullable=False)
    skill_served = Column(String, nullable=False)
    importance = Column(Float, nullable=False)
    full_minutes = Column(Integer, nullable=False)
    lite_minutes = Column(Integer, nullable=False)
    status = Column(String, nullable=False, default="todo")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    goal = relationship("GoalRow", back_populates="tasks")
    prereqs = relationship(
        "TaskPrereqRow",
        foreign_keys="TaskPrereqRow.task_id",
        back_populates="task",
        cascade="all, delete-orphan",
    )


class TaskPrereqRow(Base):
    __tablename__ = "task_prereqs"

    task_id = Column(String, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True)
    prereq_id = Column(String, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True)

    task = relationship("TaskRow", foreign_keys=[task_id], back_populates="prereqs")


class PlanRow(Base):
    __tablename__ = "plans"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    profile_id = Column(UUID(as_uuid=False), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=True)
    feasible = Column(Boolean, nullable=False, default=True)
    at_risk = Column(JSONB, default=list)
    tradeoff = Column(JSONB, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    profile = relationship("ProfileRow", back_populates="plans")
    blocks = relationship("BlockRow", back_populates="plan", cascade="all, delete-orphan")


class BlockRow(Base):
    __tablename__ = "blocks"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    plan_id = Column(UUID(as_uuid=False), ForeignKey("plans.id", ondelete="CASCADE"), nullable=False)
    task_id = Column(String, nullable=False)
    day = Column(Integer, nullable=False)
    start_min = Column(Integer, nullable=False)
    end_min = Column(Integer, nullable=False)
    lite = Column(Boolean, default=False)

    plan = relationship("PlanRow", back_populates="blocks")


class CompletionEventRow(Base):
    __tablename__ = "completion_events"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    task_id = Column(String, nullable=False, index=True)
    planned_minutes = Column(Integer, nullable=False)
    done = Column(Boolean, nullable=False)
    ts = Column(TIMESTAMP(timezone=True), server_default=func.now())
